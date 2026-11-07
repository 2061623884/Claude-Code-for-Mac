import { app, Notification, shell } from 'electron'
import { send, type Handlers } from './ipc/register'

export function appNotificationHandlers(focusWindow?: () => void): Pick<Handlers<'app'>, 'setDockBadge' | 'openNotificationSettings' | 'notify'> {
  const notices = new Set<Notification>()
  return {
    setDockBadge: (_event, count) => {
      app.dock?.setBadge(count === 0 ? '' : count > 99 ? '99+' : String(count))
    },

    openNotificationSettings: async () => {
      if (process.platform === 'darwin') await shell.openExternal('x-apple.systempreferences:com.apple.Notifications-Settings.extension')
      else if (process.platform === 'win32') await shell.openExternal('ms-settings:notifications')
      else throw new Error('请在系统设置中打开通知设置')
    },

    notify: (event, title, body, silent, sessionId) => {
      if (!Notification.isSupported()) throw new Error('系统不支持通知')
      const notice = new Notification({ title, body, silent })
      notices.add(notice)
      notice.once('close', () => notices.delete(notice))
      notice.once('click', () => {
        focusWindow?.()
        if (sessionId) send(event.sender, 'app:onNotificationClick', sessionId)
        notices.delete(notice)
      })
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { notices.delete(notice); reject(new Error('系统未确认通知投递，请检查系统通知权限')) }, 10000)
        notice.once('show', () => { clearTimeout(timeout); resolve() })
        notice.once('failed', (_event, error) => { clearTimeout(timeout); notices.delete(notice); reject(new Error(error)) })
        notice.show()
      })
    }
  }
}
