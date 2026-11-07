import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { channel, contract, type DeskApi, type MembersOf, type Namespace } from '../shared/ipc/contract'

type LocalImplementations = { [N in Namespace as MembersOf<N, 'local'> extends never ? never : N]: Pick<DeskApi[N], MembersOf<N, 'local'>> }

const locals: LocalImplementations = {
  files: { pathFor: (file) => webUtils.getPathForFile(file) }
}

function member(namespace: string, name: string, kind: 'invoke' | 'event' | 'local'): unknown {
  const route = channel(namespace, name)
  if (kind === 'invoke') return (...args: unknown[]) => ipcRenderer.invoke(route, ...args)
  if (kind === 'event') {
    return (listener: (...args: unknown[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => listener(...args)
      ipcRenderer.on(route, handler)
      return () => ipcRenderer.removeListener(route, handler)
    }
  }
  return (locals as Record<string, Record<string, unknown>>)[namespace][name]
}

const api = Object.fromEntries(Object.entries(contract).map(([namespace, members]) => [
  namespace,
  Object.fromEntries(Object.entries(members).map(([name, definition]) => [name, member(namespace, name, definition.kind)]))
])) as DeskApi

contextBridge.exposeInMainWorld('desk', api)
