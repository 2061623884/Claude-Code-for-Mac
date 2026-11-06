import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir, userInfo } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import type { BtwTurn, ChatEvent, Decision, QueueAction, SessionOptions } from '../shared/chat'
import type { DemoState, Settings } from '../shared/types'
import { SessionManager } from './live/SessionManager'
import * as files from './files'
import * as meta from './meta'
import { planUsage, toPlanUsage } from './usage'
import { withIdleQuery } from './sdk'
import { UsageWorkerClient } from './usageWorkerClient'
import { UsageProfiles, usageAccount } from './usageProfile'
import type { UsageOverview } from '../shared/usageAnalytics'
import { onClaudeConfigChanged, watchClaudeConfig } from './claudeConfigChanges'
import { readClaudeConfig } from './claudeConfigSnapshot'
import { runLocalCommand } from './localCommand'
import * as projects from './projects'
import * as sessions from './sessions'
import * as store from './store'
import { CommandCatalog } from './commandCatalog'
import { readMetadata } from './metadataQuery'
import { activityRepository } from './activityRepository'
import { createSessionPreferencesRepository } from './sessionPreferences'
import { createHumanSubmissionRepository } from './humanSubmissionRepository'
import { registerAppNotifications } from './appNotifications'
import { Scheduler } from './schedules'
import type { ScheduledTaskInput } from '../shared/schedules'

function str(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`参数 ${name} 无效`)
  return value
}

export function applyTheme(theme: Settings['theme']): void {
  nativeTheme.themeSource = theme
}

let usageIndex: UsageWorkerClient | undefined
function statistics(): UsageWorkerClient {
  return usageIndex ??= new UsageWorkerClient(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), join(app.getPath('userData'), 'usage-index.json'))
}
function profiles(): UsageProfiles { return new UsageProfiles(join(app.getPath('userData'), 'usage-profiles')) }
let overviewRequest: Promise<UsageOverview> | null = null
let activeAccountKey: string | null = null
function overview(): Promise<UsageOverview> {
  if (overviewRequest) return overviewRequest
  overviewRequest = withIdleQuery({ cwd: homedir() }, async q => {
    const account = usageAccount(await q.accountInfo())
    activeAccountKey = account.key
    const profile = await profiles().get(account)
    try {
      const usage = toPlanUsage(await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }))
      return { account, usage, profile, updatedAt: Date.now() }
    } catch (error: any) {
      return { account, usage: null, usageError: String(error.message ?? error), profile, updatedAt: Date.now() }
    }
  }).catch(error => { activeAccountKey = null; throw error }).finally(() => { overviewRequest = null })
  return overviewRequest
}
function broadcast(sessionId: string, event: ChatEvent): void {
  if (event.kind === 'result') void statistics().recordDuration(event.durationMs).catch(error => console.error('Usage statistics:', error))
  if (process.env.CLAUDE_DESK_DEBUG) console.log('[emit]', sessionId.slice(0, 8), event.kind)
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('chat:event', sessionId, event)
}

onClaudeConfigChanged(change => {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('meta:configChanged', change)
})

const commandConfiguration = (): string => JSON.stringify([store.read().settings.claudePath ?? null, app.getVersion()])
export const commandCatalog: CommandCatalog = new CommandCatalog({
  directory: () => join(app.getPath('userData'), 'command-catalog'),
  configuration: commandConfiguration,
  load: (cwd, signal, configuration) => chats.commandsFor(cwd, configuration) ?? readMetadata(cwd, signal).then((init) => init.commands),
  publish: (snapshot) => { for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('meta:commands', snapshot) }
})
export const chats: SessionManager = new SessionManager(broadcast, activityRepository, { configuration: commandConfiguration, publisher: (cwd) => commandCatalog.publisher(cwd) }, createHumanSubmissionRepository(() => join(app.getPath('userData'), 'human-submissions')), createSessionPreferencesRepository(() => join(app.getPath('userData'), 'session-preferences')))

function sendAll(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel, ...args)
}

export const scheduler: Scheduler = new Scheduler({
  file: () => join(app.getPath('userData'), 'schedules.json'),
  options: (task) => {
    const { settings } = store.read()
    if (task.mode === 'bypassPermissions' && !settings.allowBypass) throw new Error('「跳过所有权限」未在设置中启用')
    return { model: settings.defaultModel ?? null, mode: task.mode, effort: settings.defaultEffort ?? null }
  },
  start: (projectPath, prompt, options) => chats.start(projectPath, prompt, options),
  isBusy: (sessionId) => chats.isBusy(sessionId),
  onStarted: (run) => sendAll('schedules:started', run),
  onChanged: (tasks) => sendAll('schedules:changed', tasks)
})

export function projectMetadata(cwd: string) {
  return meta.get(cwd, commandCatalog.seedFromMetadata(cwd))
}

export function registerIpc(demo: DemoState | null, focusWindow?: () => void): void {
  const handle = (channel: string, fn: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, (_e, ...args) => fn(...args))
  }

  registerAppNotifications(focusWindow)
  handle('app:state', () => {
    let username: string | null = null
    try { username = userInfo().username } catch { /* greeting may omit the name */ }
    return { seededFromHistory: store.read().seededFromHistory, demo, home: homedir(), username }
  })
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

  const task = (value: unknown): ScheduledTaskInput => {
    if (!value || typeof value !== 'object') throw new Error('参数 task 无效')
    return value as ScheduledTaskInput
  }
  handle('schedules:list', () => scheduler.list())
  handle('schedules:create', (input) => scheduler.create(task(input)))
  handle('schedules:update', (id, input) => scheduler.update(str(id, 'id'), task(input)))
  handle('schedules:setEnabled', (id, enabled) => scheduler.setEnabled(str(id, 'id'), enabled === true))
  handle('schedules:remove', (id) => scheduler.remove(str(id, 'id')))
  handle('schedules:runNow', (id) => scheduler.runNow(str(id, 'id')))

  handle('sessions:list', (path) => sessions.list(str(path, 'path')))
  handle('sessions:rename', (id, title, path) => sessions.rename(str(id, 'id'), str(title, 'title'), str(path, 'path')))
  handle('sessions:setArchived', (id, archived) => sessions.setArchived(str(id, 'id'), archived === true))

  handle('settings:get', () => store.read().settings)
  handle('settings:set', (patch) => {
    if (patch && typeof patch === 'object' && 'executionLanguage' in patch && patch.executionLanguage !== 'zh' && patch.executionLanguage !== 'en') throw new Error('执行提示语言仅支持中文或英文')
    const previousPath = store.read().settings.claudePath
    const next = store.update((d) => {
      d.settings = { ...d.settings, ...(patch as Partial<Settings>) }
    }).settings
    if (next.claudePath !== previousPath) { commandCatalog.invalidate(); meta.invalidate() }
    applyTheme(next.theme)
    return next
  })

  handle('meta:get', path => projectMetadata(typeof path === 'string' ? path : homedir()))
  handle('meta:cachedModels', path => meta.cachedModels(typeof path === 'string' ? path : undefined))
  handle('meta:commands', (path, force) => {
    const cwd = str(path, 'path')
    if (!isAbsolute(cwd)) throw new Error('项目路径必须是绝对路径')
    return commandCatalog.get(cwd, force === true)
  })
  handle('meta:usage', () => planUsage())
  handle('usage:overview', () => overview())
  handle('usage:stats', refresh => refresh === true ? statistics().refresh() : statistics().get())
  handle('usage:profile', (key, profile) => {
    if (key !== activeAccountKey) throw new Error('账户信息已变化，请刷新后重试')
    return profiles().save(str(key, 'accountKey'), profile)
  })
  handle('meta:configSnapshot', path => { const cwd = str(path, 'path'); watchClaudeConfig(cwd); return readClaudeConfig(cwd) })
  handle('meta:config', (path, setting) =>
    runLocalCommand(str(path, 'path'), typeof setting === 'string' && setting ? `/config ${setting}` : '/config')
  )
  handle('files:saveImage', async (bytes, mime) => {
    const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
    const ext = extensions[String(mime)]
    if (!ext || !(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error('图片格式不支持或超过 25 MB')
    const directory = join(app.getPath('userData'), 'pasted-images')
    await mkdir(directory, { recursive: true })
    const path = join(directory, `${randomUUID()}.${ext}`)
    await writeFile(path, bytes)
    return path
  })
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
  handle('chat:prepareControls', (id, path) => chats.prepareControls(str(id, 'id'), str(path, 'path')))
  handle('chat:open', (id, path) => chats.openForDisplay(str(id, 'id'), str(path, 'path')))
  handle('chat:start', (path, text, o) => chats.start(str(path, 'path'), str(text, 'text'), opts(o)))
  handle('chat:edit', (id, path, messageId, text) => chats.edit(str(id, 'id'), str(path, 'path'), str(messageId, 'messageId'), str(text, 'text')))
  handle('chat:send', (id, path, text, o, attachments) => chats.send(str(id, 'id'), str(path, 'path'), str(text, 'text'), opts(o), Array.isArray(attachments) ? attachments.map(p => str(p, 'attachment')) : []))
  handle('chat:queue', (id, path, action) => chats.queueAction(str(id, 'id'), str(path, 'path'), action as QueueAction))
  handle('chat:interrupt', (id) => chats.interrupt(str(id, 'id')))
  handle('chat:setMode', (id, mode) => chats.setMode(str(id, 'id'), mode as SessionOptions['mode']))
  handle('chat:setModel', (id, model) => chats.setModel(str(id, 'id'), (model as string | null) ?? null))
  handle('chat:control', (id, path, operation, value) => chats.control(str(id, 'id'), str(path, 'path'), str(operation, 'operation'), typeof value === 'string' ? value : undefined))
  handle('chat:setWorkflows', (id, value) => { if (typeof value !== 'boolean') throw new Error('无效开关值'); return chats.setWorkflows(str(id, 'id'), value) })
  handle('chat:setFastMode', (id, value) => { if (typeof value !== 'boolean') throw new Error('无效开关值'); return chats.setFastMode(str(id, 'id'), value) })
  handle('chat:setUltracode', (id, enabled) => { if (typeof enabled !== 'boolean') throw new Error('无效开关值'); return chats.setUltracode(str(id, 'id'), enabled) })
  handle('chat:refreshRuntime', id => chats.refreshRuntime(str(id, 'id')))
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
