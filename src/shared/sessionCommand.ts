import type { SessionOptions } from './chat'
import { APP_COMMANDS, type AppPanelName } from './commandCatalog'
const efforts = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

export type DesktopCommand =
  | { kind: 'panel'; panel: AppPanelName }
  | { kind: 'options'; patch: Partial<SessionOptions> }
  | { kind: 'config'; setting: string }
  | { kind: 'session'; name: 'output-style' | 'autocompact' | 'mcp'; args: string }

/** Classify raw user text before attachments, transcript creation, or queue insertion. */
export function parseDesktopCommand(text: string): DesktopCommand | null {
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  if (!match) return null
  const [, name, raw = ''] = match
  const args = raw.trim()
  const panel = APP_COMMANDS.find(command => command.name === name)?.panel
  if (!panel) return null // Skills and context-changing engine commands keep their prompt semantics.
  if (!args) return { kind: 'panel', panel }
  if (/[\r\n]/.test(args)) throw new Error(`/${name} 只能包含一条控制指令`)
  if (name === 'fast') {
    if (!['on', 'off'].includes(args)) throw new Error('用法：/fast [on|off]')
    return { kind: 'options', patch: { fastMode: args === 'on' } }
  }
  if (name === 'model') {
    if (/\s/.test(args)) throw new Error('用法：/model <模型名称>')
    return { kind: 'options', patch: { model: ['auto', 'default'].includes(args) ? null : args } }
  }
  if (name === 'effort') {
    const ultra = /^ultracode(?:\s+(on|off))?$/.exec(args)
    if (ultra) return { kind: 'options', patch: { ultracode: ultra[1] !== 'off' } }
    if (['auto', 'default'].includes(args)) return { kind: 'options', patch: { effort: null } }
    if (efforts.has(args)) return { kind: 'options', patch: { effort: args as SessionOptions['effort'] } }
    throw new Error('用法：/effort <low|medium|high|xhigh|max|auto|ultracode [on|off]>')
  }
  if (name === 'config' || name === 'settings') {
    if (!/^[A-Za-z][\w.-]*=\S[^\r\n]*$/.test(args)) throw new Error('用法：/config key=value')
    if (/\s+[A-Za-z][\w.-]*=/.test(args)) throw new Error('请一次修改一个设置')
    return { kind: 'config', setting: args }
  }
  if (name === 'output-style') {
    if (/\s/.test(args)) throw new Error('用法：/output-style <风格名称>')
    return { kind: 'session', name, args }
  }
  if (name === 'autocompact') {
    if (!/^(?:auto|reset|unset|default|\d+(?:\.\d+)?[km]?)$/i.test(args)) throw new Error('用法：/autocompact [auto|tokens]')
    return { kind: 'session', name, args }
  }
  if (name === 'mcp') {
    if (!/^(?:reconnect|enable|disable)(?:\s+\S+)?$/.test(args)) throw new Error('用法：/mcp <reconnect|enable|disable> [服务名称|all]')
    return { kind: 'session', name, args }
  }
  throw new Error(`/${name} 不接受参数`)
}

/** Compatibility helper for option controls; invalid known commands never fall through to a prompt. */
export function sessionCommand(text: string): Partial<SessionOptions> | null {
  const command = parseDesktopCommand(text)
  return command?.kind === 'options' ? command.patch : null
}

export function assertChatPrompt(text: string): void {
  if (parseDesktopCommand(text)) throw new Error('设置指令不能保存为聊天消息，请退出编辑后在输入框直接执行')
}
