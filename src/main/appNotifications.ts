import { app, ipcMain, Notification, shell } from 'electron'

export function registerAppNotifications(focusWindow?: () => void): void {
  ipcMain.handle('app:setDockUnread', (_event, unread: unknown) => {
    if (typeof unread !== 'boolean') throw new Error('无效未读状态')
    // 用空格保留原生角标的底色，省去数字。
    app.dock?.setBadge(unread ? ' ' : '')
  })

  ipcMain.handle('app:openNotificationSettings', async () => {
    if (process.platform === 'darwin') await shell.openExternal('x-apple.systempreferences:com.apple.Notifications-Settings.extension')
    else if (process.platform === 'win32') await shell.openExternal('ms-settings:notifications')
    else throw new Error('请在系统设置中打开通知设置')
  })

  const notices = new Set<Notification>()
  ipcMain.handle('app:notify', (event, title: unknown, body: unknown, silent: unknown, sessionId?: string) => {
    if (!Notification.isSupported()) throw new Error('系统不支持通知')
    if (typeof title !== 'string' || title === '') throw new Error('参数 title 无效')
    const notice = new Notification({ title, body: typeof body === 'string' ? body : '', silent: silent === true })
    notices.add(notice)
    notice.once('close', () => notices.delete(notice))
    notice.once('click', () => {
      focusWindow?.()
      if (typeof sessionId === 'string' && !event.sender.isDestroyed()) event.sender.send('app:notificationClick', sessionId)
      notices.delete(notice)
    })
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { notices.delete(notice); reject(new Error('系统未确认通知投递，请检查系统通知权限')) }, 10000)
      notice.once('show', () => { clearTimeout(timeout); resolve() })
      notice.once('failed', (_event, error) => { clearTimeout(timeout); notices.delete(notice); reject(new Error(error)) })
      notice.show()
    })
  })
}
