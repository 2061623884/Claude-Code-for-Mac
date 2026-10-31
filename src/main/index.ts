import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import type { DemoState } from '../shared/types'
import { adoptLoginShellPath } from './env'
import { applyTheme, chats, registerIpc } from './ipc'
import * as store from './store'
import { registerWorkspaceIpc, closeWorkspace } from './workspace'

if (app.isPackaged) adoptLoginShellPath()

// 应用数据放在独立目录，开发截图时可用 CLAUDE_DESK_USERDATA 指向临时目录
app.setPath('userData', process.env.CLAUDE_DESK_USERDATA ?? join(app.getPath('appData'), 'claude-desk'))

// 开发截图：CLAUDE_DESK_SHOT=输出.png CLAUDE_DESK_DEMO='{"route":"new"}' CLAUDE_DESK_THEME=dark
const shotPath = process.env.CLAUDE_DESK_SHOT
const demo: DemoState | null = process.env.CLAUDE_DESK_DEMO ? JSON.parse(process.env.CLAUDE_DESK_DEMO) : null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#262624' : '#ffffff',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => {
    // 截图模式不抢焦点，避免打断正在使用电脑的人
    if (shotPath) win.showInactive()
    else win.show()
    if (shotPath) {
      setTimeout(async () => {
        writeFileSync(shotPath, (await win.capturePage()).toPNG())
        app.exit(0)
      }, Number(process.env.CLAUDE_DESK_SHOT_DELAY ?? 2500))
    }
  })
  // 回复里的链接用系统浏览器打开，不在应用里开新窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

if (process.argv.includes('--probe')) {
  app.dock?.hide()
  app.whenReady().then(async () => {
    const { runProbe } = await import('./probe')
    const code = await runProbe().then(
      () => 0,
      (err) => {
        console.error('[probe] 失败:', err)
        return 1
      }
    )
    app.exit(code)
  })
} else {
  app.whenReady().then(() => {
    const theme = process.env.CLAUDE_DESK_THEME as 'light' | 'dark' | undefined
    applyTheme(theme ?? store.read().settings.theme)
    registerIpc(demo)
    registerWorkspaceIpc()
    createWindow()
  })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => { chats.closeAll(); closeWorkspace() })
}
