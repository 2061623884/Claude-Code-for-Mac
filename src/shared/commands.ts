// 把本地斜杠命令（/context、/usage、/model…）的文本输出解析成结构化数据，供界面渲染成卡片。纯函数。
// 输出格式来自 Claude Code 本身，解析不了时退回原文显示。

export type CommandView =
  | {
      kind: 'context'
      model: string | null
      used: number
      max: number
      percent: number
      parts: { name: string; tokens: number }[]
      /** 记忆文件、技能等明细（Markdown） */
      details: string
    }
  | { kind: 'usage'; windows: { label: string; percent: number; reset: string }[]; details: string }
  | { kind: 'choice'; current: string | null; options: { value: string; detail?: string; current?: boolean }[] }
  | { kind: 'config'; items: { key: string; values: string[] }[] }
  /** 只有一行的结果，如「Set model to …」 */
  | { kind: 'line'; text: string }
  | { kind: 'text'; text: string; markdown: boolean }

const TITLES: Record<string, string> = {
  context: '上下文窗口',
  usage: '套餐用量',
  model: '模型',
  effort: '思考程度',
  advisor: '顾问模型',
  'output-style': '输出风格',
  config: 'Claude Code 设置',
  mcp: 'MCP 服务器',
  autocompact: '自动压缩',
  'list-agents': '其他会话',
  clear: '清空对话',
  compact: '压缩对话'
}

/** 命令原文：/model sonnet */
export function commandText(name: string, args: string): string {
  return `/${name}${args ? ` ${args}` : ''}`
}

export function commandTitle(name: string): string {
  return TITLES[name] ?? '命令结果'
}

/** 「24.4k」「1m」「10」→ token 数 */
export function parseTokenCount(s: string): number | null {
  const m = /^~?\s*([\d.,]+)\s*([km]?)$/i.exec(s.trim())
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  const unit = m[2].toLowerCase()
  return Math.round(n * (unit === 'k' ? 1_000 : unit === 'm' ? 1_000_000 : 1))
}

// 不算作已占用的类别：剩余空间、为自动压缩预留的空间、按需加载（未进入上下文）的工具
const NOT_USED = /^(Free space|Autocompact buffer)$|\(deferred\)/i

function parseContext(text: string): CommandView | null {
  const tokens = /\*\*Tokens:\*\*\s*([\d.,]+[km]?)\s*\/\s*([\d.,]+[km]?)\s*\((\d+(?:\.\d+)?)%\)/i.exec(text)
  if (!tokens) return null
  const used = parseTokenCount(tokens[1])
  const max = parseTokenCount(tokens[2])
  if (used === null || !max) return null
  const model = /\*\*Model:\*\*\s*(.+?)\s*$/m.exec(text)?.[1] ?? null

  // 「### Estimated usage by category」下的表格，到下一个 ### 为止
  const start = text.search(/^###\s+Estimated usage by category/m)
  const rest = start < 0 ? '' : text.slice(start).replace(/^###[^\n]*\n/, '')
  const end = rest.search(/^###\s/m)
  const table = end < 0 ? rest : rest.slice(0, end)
  const parts: { name: string; tokens: number }[] = []
  for (const line of table.split('\n')) {
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 4 || cells[1] === 'Category' || /^-+$/.test(cells[1])) continue
    const n = parseTokenCount(cells[2])
    if (n === null || n <= 0 || NOT_USED.test(cells[1])) continue
    parts.push({ name: cells[1], tokens: n })
  }
  return { kind: 'context', model, used, max, percent: Number(tokens[3]), parts, details: end < 0 ? '' : rest.slice(end).trim() }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** 「Oct 31 at 3:29pm (Asia/Taipei)」→「10月31日 15:29」；认不出来就原样返回 */
export function resetTextZh(s: string): string {
  const m = /^(?:([A-Za-z]{3})\w*\s+(\d{1,2})(?:,?\s+at)?\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(s.trim())
  if (!m) return s
  let h = Number(m[3]) % 12
  if (m[5].toLowerCase() === 'pm') h += 12
  const time = `${String(h).padStart(2, '0')}:${m[4] ?? '00'}`
  const month = m[1] ? MONTHS.indexOf(m[1].toLowerCase()) : -1
  return month >= 0 ? `${month + 1}月${Number(m[2])}日 ${time}` : time
}

function usageLabelZh(label: string): string {
  if (/^current session$/i.test(label)) return '当前会话（5 小时）'
  const week = /^current week\s*\((.+)\)$/i.exec(label)
  if (week) return `本周（${/^all models$/i.test(week[1]) ? '所有模型' : week[1]}）`
  return label
}

function parseUsage(text: string): CommandView | null {
  const windows: { label: string; percent: number; reset: string }[] = []
  const rest: string[] = []
  for (const line of text.split('\n')) {
    const m = /^\s*(.+?):\s*(\d+(?:\.\d+)?)%\s*used(?:\s*·\s*resets\s+(.+?))?\s*$/i.exec(line)
    if (m) windows.push({ label: usageLabelZh(m[1]), percent: Number(m[2]), reset: m[3] ? resetTextZh(m[3]) : '' })
    else if (windows.length) rest.push(line)
  }
  if (!windows.length) return null
  return { kind: 'usage', windows, details: rest.join('\n').trim() }
}

function parseConfig(text: string): CommandView | null {
  const items: { key: string; values: string[] }[] = []
  for (const line of text.split('\n')) {
    const m = /^\s+([A-Za-z][\w.-]*)=(.+)$/.exec(line)
    if (m) items.push({ key: m[1], values: m[2].trim() === '<value>' ? [] : m[2].split('|').map((v) => v.trim()) })
  }
  return items.length ? { kind: 'config', items } : null
}

function parseChoice(text: string): CommandView | null {
  const lines = text.split('\n').map((l) => l.trim())
  const options: { value: string; detail?: string; current?: boolean }[] = []
  for (const line of lines) {
    // Usage: /effort <low|medium|high>
    const usage = /^Usage:\s*\/\S+\s+[<[]([^>\]]+\|[^>\]]+)[>\]]/i.exec(line)
    if (usage && !options.length) usage[1].split('|').forEach((v) => options.push({ value: v.trim() }))
    // Available: sonnet, opus, …, or a full model ID.
    const avail = /Available:\s*(.+?)\.?$/i.exec(line)
    if (avail) {
      options.length = 0
      for (const v of avail[1].split(/,\s*(?:or\s+)?/)) if (!/\s/.test(v.trim()) && v.trim()) options.push({ value: v.trim() })
    }
    // - Concise: Claude responds tersely…   /   - default (current)
    const item = /^-\s+([\w.[\]-]+)(\s*\(current\))?(?::\s*(.+))?$/.exec(line)
    if (item) options.push({ value: item[1], detail: item[3], current: Boolean(item[2]) })
  }
  if (!options.length) return null
  // 首行如果不是用法说明，就是当前值：「Current model: `Opus 5.5 (default)` (effort: high)」「Advisor: off」
  const first = lines[0] ?? ''
  const current = /^(usage|available)/i.test(first) ? null : first.replace(/`/g, '')
  // 同一个选项可能既在用法里又在列表里，保留带说明的那个
  const seen = new Map<string, (typeof options)[number]>()
  for (const o of options) if (!seen.has(o.value) || o.detail) seen.set(o.value, o)
  return { kind: 'choice', current, options: [...seen.values()] }
}

export function parseCommandOutput(name: string, output: string): CommandView {
  const text = output.trim()
  const special = name === 'context' ? parseContext(text) : name === 'usage' ? parseUsage(text) : name === 'config' ? parseConfig(text) : null
  if (special) return special
  const choice = parseChoice(text)
  if (choice) return choice
  if (!text.includes('\n')) return { kind: 'line', text }
  return { kind: 'text', text, markdown: /^#{1,4}\s|^\|.*\|\s*$/m.test(text) }
}

/** /config 各项的中文说明 */
export const CONFIG_LABELS: Record<string, string> = {
  agentPushNotifEnabled: '子代理完成时推送通知',
  artifacts: 'Artifacts 页面',
  autoCompact: '自动压缩对话',
  autoConnectIde: '自动连接 IDE',
  autoScroll: '自动滚动',
  checkpoints: '检查点（可回退修改）',
  copyFullResponse: '复制完整回复',
  copyOnSelect: '选中即复制',
  defaultToAgentsView: '默认打开代理视图',
  editor: '输入框编辑模式',
  externalEditorContext: '外部编辑器上下文',
  gitignore: '遵循 .gitignore',
  inputNeededNotifEnabled: '需要输入时通知',
  language: '回复语言',
  leftArrowOpensAgents: '左方向键打开代理列表',
  model: '默认模型',
  notifChannel: '通知方式',
  outputStyle: '输出风格',
  permissionMode: '默认权限模式',
  prStatus: '显示 PR 状态',
  progressBar: '进度条',
  promptSuggestionEnabled: '输入建议',
  recap: '回到会话时显示回顾',
  reduceMotion: '减少动效',
  remoteControl: '远程控制',
  switchModelsOnFlag: '额度用尽时切换模型',
  theme: '终端主题',
  thinking: '思考模式',
  timeFormat: '时间格式',
  tips: '显示提示',
  turnDuration: '显示每轮耗时',
  useAutoModeDuringPlan: '计划模式中使用自动模式',
  verbose: '详细输出',
  workflowKeywordTriggerEnabled: '关键词触发工作流',
  workflowSizeGuideline: '工作流规模',
  workflows: '工作流',
  worktreeBaseRef: 'worktree 基准'
}
