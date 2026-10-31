import { realpathSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { BrowserWindow, ipcMain, WebContentsView, type WebContents } from 'electron'
import { spawn, type IPty } from 'node-pty'
import { browserUrl, type BrowserState, type ViewBounds } from '../shared/workspace'

interface TerminalEntry { owner: WebContents; pty: IPty; output: string; exited: boolean }
interface BrowserEntry { owner: WebContents; win: BrowserWindow; view: WebContentsView; error: string | null }
const terminals = new Map<string, TerminalEntry>()
const browsers = new Map<string, BrowserEntry>()
const key = (owner: WebContents, id: string): string => `${owner.id}:${id}`
function idOf(value: unknown): string {
  if (typeof value !== 'string' || !/^page:[\w-]+$/.test(value)) throw new Error('页面标识无效')
  return value
}
function send(owner: WebContents, channel: string, ...args: unknown[]): void {
  if (!owner.isDestroyed()) owner.send(channel, ...args)
}
function browserState(entry: BrowserEntry): BrowserState {
  const wc = entry.view.webContents
  return { url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(), back: wc.navigationHistory.canGoBack(), forward: wc.navigationHistory.canGoForward(), error: entry.error }
}
function closeBrowser(k: string): void {
  const entry = browsers.get(k)
  if (!entry) return
  browsers.delete(k)
  if (!entry.win.isDestroyed()) entry.win.contentView.removeChildView(entry.view)
  if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close()
}
function closeTerminal(k: string): void {
  const entry = terminals.get(k)
  terminals.delete(k)
  if (entry && !entry.exited) entry.pty.kill()
}
export function closeWorkspace(): void {
  for (const k of terminals.keys()) closeTerminal(k)
  for (const k of browsers.keys()) closeBrowser(k)
}

export function registerWorkspaceIpc(): void {
  const owners = new Set<number>()
  const handle = (channel: string, fn: (owner: WebContents, id: string, ...args: any[]) => unknown): void => {
    ipcMain.handle(channel, (event, id, ...args) => {
      const owner = event.sender
      const win = BrowserWindow.fromWebContents(owner)
      if (!win || win.webContents !== owner || event.senderFrame !== owner.mainFrame) throw new Error('无效的工作区请求')
      if (!owners.has(owner.id)) {
        owners.add(owner.id)
        owner.once('destroyed', () => {
          for (const [k, entry] of terminals) if (entry.owner === owner) closeTerminal(k)
          for (const [k, entry] of browsers) if (entry.owner === owner) closeBrowser(k)
          owners.delete(owner.id)
        })
      }
      return fn(owner, idOf(id), ...args)
    })
  }
  handle('terminal:open', (owner, id, cwd: string) => {
    const k = key(owner, id)
    const existing = terminals.get(k)
    if (existing) return { output: existing.output, exited: existing.exited }
    if (typeof cwd !== 'string' || !isAbsolute(cwd) || !statSync(cwd).isDirectory()) throw new Error('项目文件夹不存在')
    if ([...terminals.values()].filter((e) => e.owner === owner).length >= 12) throw new Error('最多同时打开 12 个终端')
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    delete env.ELECTRON_RUN_AS_NODE
    const pty = spawn(process.env.SHELL || '/bin/zsh', ['-l'], { name: 'xterm-256color', cols: 80, rows: 24, cwd: realpathSync(cwd), env: { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } })
    const entry = { owner, pty, output: '', exited: false }
    terminals.set(k, entry)
    pty.onData((data) => {
      entry.output = (entry.output + data).slice(-200_000)
      send(owner, 'terminal:data', id, data)
    })
    pty.onExit(({ exitCode }) => { entry.exited = true; if (terminals.get(k) === entry) send(owner, 'terminal:exit', id, exitCode) })
    return { output: '', exited: false }
  })
  handle('terminal:write', (owner, id, data: string) => {
    if (typeof data !== 'string' || data.length > 1_000_000) throw new Error('终端输入无效')
    const entry = terminals.get(key(owner, id))
    if (entry && !entry.exited) entry.pty.write(data)
  })
  handle('terminal:resize', (owner, id, cols: number, rows: number) => {
    if (![cols, rows].every((n) => Number.isInteger(n) && n >= 1 && n <= 1000)) return
    const entry = terminals.get(key(owner, id))
    if (entry && !entry.exited) entry.pty.resize(cols, rows)
  })
  handle('terminal:close', (owner, id) => closeTerminal(key(owner, id)))
  handle('browser:open', (owner, id) => {
    const k = key(owner, id)
    const existing = browsers.get(k)
    if (existing) return browserState(existing)
    const win = BrowserWindow.fromWebContents(owner)!
    const view = new WebContentsView({ webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: 'workspace-browser' } })
    const entry: BrowserEntry = { owner, win, view, error: null }
    browsers.set(k, entry)
    win.contentView.addChildView(view)
    view.setVisible(false)
    const wc = view.webContents
    wc.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    wc.session.setPermissionCheckHandler(() => false)
    const emit = (): void => send(owner, 'browser:state', id, browserState(entry))
    const navigate = (event: Electron.Event, url: string): void => {
      try { browserUrl(url) } catch { event.preventDefault() }
    }
    wc.on('will-navigate', navigate)
    wc.on('will-redirect', navigate)
    wc.setWindowOpenHandler(({ url }) => {
      try { void wc.loadURL(browserUrl(url)).catch(() => {}) } catch { /* 不打开非网页协议 */ }
      return { action: 'deny' }
    })
    wc.on('did-start-loading', () => { entry.error = null; emit() })
    wc.on('did-stop-loading', emit)
    wc.on('did-navigate', emit)
    wc.on('did-navigate-in-page', emit)
    wc.on('page-title-updated', emit)
    wc.on('did-fail-load', (_e, code, description, _url, mainFrame) => {
      if (mainFrame && code !== -3) { entry.error = `网页加载失败：${description}`; emit() }
    })
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const kind = input.meta && input.key.toLowerCase() === 't' ? 'browser' : input.meta && input.key.toLowerCase() === 'p' ? 'files' : input.control && input.code === 'Backquote' ? 'terminal' : null
      if (kind) { event.preventDefault(); send(owner, 'workspace:shortcut', kind) }
    })
    return browserState(entry)
  })
  handle('browser:navigate', async (owner, id, url: string) => {
    const entry = browsers.get(key(owner, id))
    if (!entry) throw new Error('浏览器尚未就绪')
    await entry.view.webContents.loadURL(browserUrl(url)).catch((err) => {
      if (err.code !== 'ERR_ABORTED') throw err
    })
  })
  handle('browser:bounds', (owner, id, bounds: ViewBounds | null) => {
    const entry = browsers.get(key(owner, id))
    if (!entry) return
    if (!bounds) { entry.view.setVisible(false); return }
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return
    const area = entry.win.getContentBounds()
    const x = Math.max(0, Math.round(bounds.x)); const y = Math.max(0, Math.round(bounds.y))
    const width = Math.max(0, Math.min(Math.round(bounds.width), area.width - x))
    const height = Math.max(0, Math.min(Math.round(bounds.height), area.height - y))
    entry.view.setBounds({ x, y, width, height })
    entry.view.setVisible(width > 0 && height > 0)
  })
  handle('browser:action', (owner, id, action: string) => {
    const wc = browsers.get(key(owner, id))?.view.webContents
    if (!wc) return
    if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
    if (action === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
    if (action === 'reload') wc.reload()
    if (action === 'stop') wc.stop()
  })
  handle('browser:close', (owner, id) => closeBrowser(key(owner, id)))
}
