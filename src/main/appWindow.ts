import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, Menu, nativeTheme, shell } from 'electron'

/** 窗口的隐藏、唤回和应用退出由同一个所有者控制；渲染层不管理进程生命周期。 */
export class AppWindow {
  private window: BrowserWindow | null = null
  private quitting = false
  private cleaned = false
  private visibleWanted = true
  constructor(private cleanup: () => void) {
    app.on('activate', () => this.open())
    app.on('second-instance', () => this.open())
    app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
    app.on('before-quit', () => {
      this.quitting = true
      if (this.cleaned) return
      this.cleaned = true
      try { this.cleanup() } catch (error) { console.error('退出清理失败', error) }
    })
  }
  installMenu(): void {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ label: app.name, submenu: [
        { role: 'about' as const }, { type: 'separator' as const }, { role: 'hide' as const }, { role: 'hideOthers' as const }, { role: 'unhide' as const }, { type: 'separator' as const },
        { id: 'quit-app', label: '退出 Claude Code', accelerator: 'Command+Q', click: () => app.quit() }
      ] }] : []),
      { label: '文件', submenu: [{ id: 'close-window', label: '关闭窗口', accelerator: 'CommandOrControl+W', click: () => this.window?.close() }] },
      { role: 'editMenu', label: '编辑' }, { role: 'viewMenu', label: '显示' }, { role: 'windowMenu', label: '窗口' }
    ]))
  }
  open(): void {
    if (this.quitting || !app.isReady()) return
    this.visibleWanted = true
    if (this.window && !this.window.isDestroyed()) {
      if (this.window.isMinimized()) this.window.restore()
      this.window.show(); this.window.focus()
      return
    }
    const win = this.create()
    this.window = win
    win.on('close', (event) => {
      if (process.platform === 'darwin' && !this.quitting) { event.preventDefault(); this.visibleWanted = false; win.hide() }
    })
    win.on('closed', () => { if (this.window === win) this.window = null })
  }
  private create(): BrowserWindow {
    const win = new BrowserWindow({
      width: 1280, height: 820, minWidth: 960, minHeight: 600,
      titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 },
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#262624' : '#ffffff', show: false,
      webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: true, nodeIntegration: false }
    })
    const shotPath = process.env.CLAUDE_DESK_SHOT
    win.once('ready-to-show', () => {
      if (this.quitting || !this.visibleWanted || win.isDestroyed()) return
      if (shotPath) win.showInactive()
      else win.show()
      if (shotPath) setTimeout(async () => {
        if (win.isDestroyed()) return
        writeFileSync(shotPath, (await win.capturePage()).toPNG())
        app.exit(0)
      }, Number(process.env.CLAUDE_DESK_SHOT_DELAY ?? 2500))
    })
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
    else void win.loadFile(join(__dirname, '../renderer/index.html'))
    return win
  }
}
