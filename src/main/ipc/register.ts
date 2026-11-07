import { BrowserWindow, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { channel, type ArgsOf, type EventChannel, type InvokeChannel, type MembersOf, type Namespace, type ResultOf } from '../../shared/ipc/contract'
import { validators, type Validator } from './validators'

type Handler<C extends InvokeChannel> = (event: IpcMainInvokeEvent, ...args: ArgsOf<C>) => ResultOf<C> | Promise<ResultOf<C>>
type ChannelIn<N extends Namespace, M extends string> = Extract<`${N}:${M}`, InvokeChannel>

/** 一个命名空间下全部需要主进程处理的方法；漏写或类型不符时编译失败 */
export type Handlers<N extends Namespace> = { [M in MembersOf<N, 'invoke'>]: Handler<ChannelIn<N, M>> }

/** 先运行 guard（如校验发送方），再校验参数，最后交给处理函数 */
export function registerNamespace<N extends Namespace>(namespace: N, handlers: Handlers<N>, guard?: (event: IpcMainInvokeEvent) => void): void {
  for (const [member, handler] of Object.entries(handlers) as [string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown][]) {
    const route = channel(namespace, member) as InvokeChannel
    const validate = validators[route] as Validator<unknown[]>
    ipcMain.handle(route, (event, ...raw) => {
      guard?.(event)
      return handler(event, ...validate(raw))
    })
  }
}

export function send<C extends EventChannel>(target: WebContents, route: C, ...args: ArgsOf<C>): void {
  if (!target.isDestroyed()) target.send(route, ...args)
}

export function broadcast<C extends EventChannel>(route: C, ...args: ArgsOf<C>): void {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) send(win.webContents, route, ...args)
}
