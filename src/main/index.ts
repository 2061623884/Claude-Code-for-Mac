import { join } from 'node:path'
import { app } from 'electron'
import { closeClaudeConfigWatchers } from './claudeConfigChanges'
import { closeTemporaryQueries } from './temporaryQuery'
import { AppWindow } from './appWindow'
import type { DemoState } from '../shared/types'
import { adoptLoginShellPath } from './env'
import { applyTheme, chats, commandCatalog, projectMetadata, registerIpc } from './ipc'
import * as store from './store'
import { flushActivityRepository } from './activityRepository'
import { registerWorkspaceIpc, closeWorkspace } from './workspace'

// 应用数据放在独立目录，开发截图时可用 CLAUDE_DESK_USERDATA 指向临时目录
app.setPath('userData', process.env.CLAUDE_DESK_USERDATA ?? join(app.getPath('appData'), 'claude-desk'))

const demo: DemoState | null = process.env.CLAUDE_DESK_DEMO ? JSON.parse(process.env.CLAUDE_DESK_DEMO) : null

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
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  if (app.isPackaged) void adoptLoginShellPath()
  const window = new AppWindow(() => {
    for (const cleanup of [() => commandCatalog.close(), closeClaudeConfigWatchers, closeTemporaryQueries, () => chats.closeAll(), flushActivityRepository, closeWorkspace]) {
      try { cleanup() } catch (error) { console.error('退出清理失败', error) }
    }
  })
  app.whenReady().then(() => {
    const theme = process.env.CLAUDE_DESK_THEME as 'light' | 'dark' | undefined
    applyTheme(theme ?? store.read().settings.theme)
    registerIpc(demo, () => window.open())
    registerWorkspaceIpc()
    window.installMenu()
    window.open()
    // The initial composer opens in the first saved project. Overlap its CLI handshake with rendering.
    const firstProject = store.read().projects[0]
    if (firstProject && demo?.route !== 'settings') void projectMetadata(firstProject.path).catch(() => {})
  })
}
