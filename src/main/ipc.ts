import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import type { BtwTurn, ChatEvent, Decision, SessionOptions } from '../shared/chat'
import type { DemoState, Settings } from '../shared/types'
import { SessionManager } from './live/SessionManager'
import * as files from './files'
import * as meta from './meta'
import { planUsage } from './usage'
import { runLocalCommand } from './localCommand'
import * as projects from './projects'
import * as sessions from './sessions'
import * as store from './store'
import { CommandCatalog } from './commandCatalog'
import { readMetadata } from './metadataQuery'
import { activityRepository } from './activityRepository'

function str(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`参数 ${name} 无效`)
  return value
}

export function applyTheme(theme: Settings['theme']): void {
  nativeTheme.themeSource = theme
}

function broadcast(sessionId: string, event: ChatEvent): void {
  if (process.env.CLAUDE_DESK_DEBUG) console.log('[emit]', sessionId.slice(0, 8), event.kind)
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('chat:event', sessionId, event)
}

const commandConfiguration = (): string => JSON.stringify([store.read().settings.claudePath ?? null, app.getVersion()])
export const commandCatalog: CommandCatalog = new CommandCatalog({
  directory: () => join(app.getPath('userData'), 'command-catalog'),
  configuration: commandConfiguration,
  load: (cwd, signal, configuration) => chats.commandsFor(cwd, configuration) ?? readMetadata(cwd, signal).then((init) => init.commands),
  publish: (snapshot) => { for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('meta:commands', snapshot) }
})
export const chats: SessionManager = new SessionManager(broadcast, activityRepository, { configuration: commandConfiguration, publisher: (cwd) => commandCatalog.publisher(cwd) })

export function registerIpc(demo: DemoState | null, focusWindow?: () => void): void {
  const handle = (channel: string, fn: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, (_e, ...args) => fn(...args))
  }

  handle('app:state', () => ({ seededFromHistory: store.read().seededFromHistory, demo, home: homedir() }))
  ipcMain.handle('app:focus', (e) => {
    if (focusWindow) { focusWindow(); return }
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win?.isMinimized()) win.restore()
    win?.show()
    app.focus({ steal: true })
  })

  ipcMain.handle('projects:pickFolder', (e) => projects.pickFolder(BrowserWindow.fromWebContents(e.sender)!))
  handle('projects:list', () => projects.list())
  handle('projects:add', (path) => projects.add(str(path, 'path')))
  handle('projects:remove', (id) => projects.remove(str(id, 'id')))
  handle('projects:setCollapsed', (id, collapsed) => projects.setCollapsed(str(id, 'id'), collapsed === true))
  handle('projects:detectFromHistory', () => projects.detectFromHistory())
  handle('projects:markSeeded', () => projects.markSeeded())
  handle('projects:revealInFinder', (path) => projects.revealInFinder(str(path, 'path')))

  handle('sessions:list', (path) => sessions.list(str(path, 'path')))
  handle('sessions:rename', (id, title, path) => sessions.rename(str(id, 'id'), str(title, 'title'), str(path, 'path')))
  handle('sessions:setArchived', (id, archived) => sessions.setArchived(str(id, 'id'), archived === true))

  handle('settings:get', () => store.read().settings)
  handle('settings:set', (patch) => {
    const previousPath = store.read().settings.claudePath
    const next = store.update((d) => {
      d.settings = { ...d.settings, ...(patch as Partial<Settings>) }
    }).settings
    if (next.claudePath !== previousPath) commandCatalog.invalidate()
    applyTheme(next.theme)
    return next
  })

  handle('meta:get', () => meta.get())
  handle('meta:commands', (path, force) => {
    const cwd = str(path, 'path')
    if (!isAbsolute(cwd)) throw new Error('项目路径必须是绝对路径')
    return commandCatalog.get(cwd, force === true)
  })
  handle('meta:usage', () => planUsage())
  handle('meta:config', (path, setting) =>
    runLocalCommand(str(path, 'path'), typeof setting === 'string' && setting ? `/config ${setting}` : '/config')
  )
  handle('files:search', (path, query) => files.search(str(path, 'path'), typeof query === 'string' ? query : ''))
  handle('files:list', (projectPath, directory) =>
    files.listProjectDirectory(str(projectPath, 'projectPath'), str(directory, 'directory'))
  )
  handle('files:create', (projectPath, directory, kind, name) => {
    if (kind !== 'file' && kind !== 'dir') throw new Error('参数 kind 无效')
    return files.createProjectEntry(
      str(projectPath, 'projectPath'),
      str(directory, 'directory'),
      kind,
      str(name, 'name')
    )
  })
  handle('files:read', (path) => files.readForPreview(str(path, 'path')))
  handle('files:watch', (path) => {
    const p = str(path, 'path')
    files.watchFile(p, () => {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('files:changed', p)
    })
  })
  handle('files:unwatch', (path) => files.unwatchFile(str(path, 'path')))
  handle('files:stat', (paths) => files.statPaths(Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string') : []))
  handle('files:open', async (path) => {
    const p = str(path, 'path')
    if (!isAbsolute(p)) throw new Error('参数 path 无效')
    const error = await shell.openPath(p)
    if (error) throw new Error(error)
  })
  handle('files:describe', (paths) => {
    if (!Array.isArray(paths) || !paths.every((path) => typeof path === 'string' && path !== '')) {
      throw new Error('参数 paths 无效')
    }
    return files.describePaths(paths)
  })

  const opts = (value: unknown): SessionOptions => value as SessionOptions
  handle('chat:open', (id, path) => chats.open(str(id, 'id'), str(path, 'path')))
  handle('chat:start', (path, text, o) => chats.start(str(path, 'path'), str(text, 'text'), opts(o)))
  handle('chat:fork', (path, from, at, text, o) =>
    chats.fork(str(from, 'from'), str(path, 'path'), str(at, 'at'), str(text, 'text'), opts(o))
  )
  handle('chat:send', (id, path, text, o) => chats.send(str(id, 'id'), str(path, 'path'), str(text, 'text'), opts(o)))
  handle('chat:interrupt', (id) => chats.interrupt(str(id, 'id')))
  handle('chat:setMode', (id, mode) => chats.setMode(str(id, 'id'), mode as SessionOptions['mode']))
  handle('chat:setModel', (id, model) => chats.setModel(str(id, 'id'), (model as string | null) ?? null))
  handle('chat:setEffort', (id, effort) => chats.setEffort(str(id, 'id'), (effort as SessionOptions['effort']) ?? null))
  handle('chat:respond', (id, requestId, decision) =>
    chats.respond(str(id, 'id'), str(requestId, 'requestId'), decision as Decision)
  )
  handle('chat:checkExternal', (id, path) => chats.checkExternal(str(id, 'id'), str(path, 'path')))
  handle('chat:reload', (id, path) => chats.reload(str(id, 'id'), str(path, 'path')))
  handle('chat:btw', (id, path, question, history, o) =>
    chats.sideQuestion(str(id, 'id'), str(path, 'path'), str(question, 'question'), (history as BtwTurn[]) ?? [], opts(o))
  )
  handle('chat:mcp', (id, path) => chats.mcp(typeof id === 'string' && id ? id : null, str(path, 'path')))
  handle('chat:context', (id, path, model) => chats.context(str(id, 'id'), str(path, 'path'), (model as string | null) ?? null))
}
