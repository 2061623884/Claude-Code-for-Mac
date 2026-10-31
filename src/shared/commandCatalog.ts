export interface CommandInfo { name: string; description: string; argumentHint: string }

export type AppPanelName = 'usage' | 'context' | 'model' | 'effort' | 'config' | 'mcp'
export const APP_COMMANDS: (CommandInfo & { panel: AppPanelName })[] = [
  { name: 'usage', description: '查看套餐用量', argumentHint: '', panel: 'usage' },
  { name: 'cost', description: '查看用量', argumentHint: '', panel: 'usage' },
  { name: 'stats', description: '查看用量统计', argumentHint: '', panel: 'usage' },
  { name: 'context', description: '查看会话上下文', argumentHint: '', panel: 'context' },
  { name: 'model', description: '选择模型', argumentHint: '[model]', panel: 'model' },
  { name: 'effort', description: '选择思考程度', argumentHint: '[level]', panel: 'effort' },
  { name: 'config', description: '查看设置', argumentHint: '[key=value]', panel: 'config' },
  { name: 'mcp', description: '查看 MCP 服务', argumentHint: '', panel: 'mcp' }
]
/** 随当前 SDK 已确认支持的常用命令；完整目录到达后由实际结果替换。 */
export const BASE_COMMANDS: CommandInfo[] = [
  { name: 'init', description: '初始化项目说明 CLAUDE.md', argumentHint: '' },
  { name: 'compact', description: '压缩当前会话上下文', argumentHint: '[instructions]' },
  { name: 'clear', description: '清空当前会话上下文', argumentHint: '' }
]
export interface CommandCatalogSnapshot {
  cwd: string
  revision: number
  commands: CommandInfo[]
  status: 'loading' | 'ready' | 'error'
  updatedAt: number
  error?: string
}
export function mergeCommands(...groups: CommandInfo[][]): CommandInfo[] {
  const byName = new Map<string, CommandInfo>()
  for (const group of groups) for (const command of group) byName.set(command.name, command)
  return [...byName.values()]
}
