import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ChatEvent } from '../shared/chat'
import type { DeskApi } from '../shared/types'

const call =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args)

function subscribe<T extends unknown[]>(channel: string, listener: (...args: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, ...args: T): void => listener(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: DeskApi = {
  usage: { overview: call('usage:overview'), stats: call('usage:stats'), saveProfile: call('usage:profile') },
  workspace: { closePage: call('workspace:closePage'), onShortcut: (listener) => subscribe('workspace:shortcut', listener) },
  terminal: {
    open: call('terminal:open'), write: call('terminal:write'), resize: call('terminal:resize'), close: call('terminal:close'),
    onData: (listener) => subscribe('terminal:data', listener), onExit: (listener) => subscribe('terminal:exit', listener)
  },
  browser: {
    open: call('browser:open'), navigate: call('browser:navigate'), bounds: call('browser:bounds'), action: call('browser:action'), close: call('browser:close'),
    onState: (listener) => subscribe('browser:state', listener)
  },
  app: {
    notify: call('app:notify'),
    setDockUnread: call('app:setDockUnread'),
    openNotificationSettings: call('app:openNotificationSettings'),
    onNotificationClick: (listener) => subscribe('app:notificationClick', listener),
    state: call('app:state'),
    focus: call('app:focus')
  },
  projects: {
    list: call('projects:list'),
    pickFolder: call('projects:pickFolder'),
    add: call('projects:add'),
    remove: call('projects:remove'),
    setCollapsed: call('projects:setCollapsed'),
    detectFromHistory: call('projects:detectFromHistory'),
    markSeeded: call('projects:markSeeded'),
    revealInFinder: call('projects:revealInFinder')
  },
  sessions: {
    list: call('sessions:list'),
    rename: call('sessions:rename'),
    setArchived: call('sessions:setArchived')
  },
  settings: { get: call('settings:get'), set: call('settings:set') },
  meta: { get: call('meta:get'), cachedModels: call('meta:cachedModels'), commands: call('meta:commands'), onCommands: (listener) => subscribe('meta:commands', listener), usage: call('meta:usage'), config: call('meta:config'), configSnapshot: call('meta:configSnapshot'), onConfigChanged: (listener) => subscribe('meta:configChanged', listener) },
  files: {
    saveImage: call('files:saveImage'),
    pathFor: (file) => webUtils.getPathForFile(file),
    describe: call('files:describe'),
    search: call('files:search'),
    list: call('files:list'),
    create: call('files:create'),
    open: call('files:open'),
    stat: call('files:stat'),
    read: call('files:read'),
    watch: call('files:watch'),
    unwatch: call('files:unwatch'),
    onChanged(listener) {
      const handler = (_e: Electron.IpcRendererEvent, path: string): void => listener(path)
      ipcRenderer.on('files:changed', handler)
      return () => ipcRenderer.removeListener('files:changed', handler)
    }
  },
  chat: {
    open: call('chat:open'),
    start: call('chat:start'),
    send: call('chat:send'),
    queue: call('chat:queue'),
    edit: call('chat:edit'),
    interrupt: call('chat:interrupt'),
    setMode: call('chat:setMode'),
    setModel: call('chat:setModel'),
    setEffort: call('chat:setEffort'),
    control: call('chat:control'),
    setWorkflows: call('chat:setWorkflows'),
    prepareControls: call('chat:prepareControls'),
    setFastMode: call('chat:setFastMode'),
    setUltracode: call('chat:setUltracode'),
    refreshRuntime: call('chat:refreshRuntime'),
    respond: call('chat:respond'),
    checkExternal: call('chat:checkExternal'),
    reload: call('chat:reload'),
    context: call('chat:context'),
    btw: call('chat:btw'),
    mcp: call('chat:mcp'),
    onEvent(listener) {
      const handler = (_e: Electron.IpcRendererEvent, sessionId: string, event: ChatEvent): void => listener(sessionId, event)
      ipcRenderer.on('chat:event', handler)
      return () => ipcRenderer.removeListener('chat:event', handler)
    }
  }
}

contextBridge.exposeInMainWorld('desk', api)
