// SDK 活动适配层：只保存摘要所需的事实，不复制完整工具参数和返回正文。
import { diffLines } from 'diff'
import { basename, resolve } from 'node:path'
import type { ActivityStatus, SessionSummaryData, SummaryItem } from '../shared/sessionSummary'

type Json = Record<string, unknown>
const obj = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const str = (value: unknown): string => typeof value === 'string' ? value : ''
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const short = (value: unknown): string => str(value).slice(0, 2000)
const status = (value: unknown): ActivityStatus => ({ in_progress: 'running', running: 'running', pending: 'pending', completed: 'completed', failed: 'failed', stopped: 'stopped', killed: 'stopped' } as Record<string, ActivityStatus>)[str(value)] ?? 'unknown'
const terminal = (value?: ActivityStatus): boolean => value === 'completed' || value === 'failed' || value === 'stopped'
function text(content: unknown): string {
  return typeof content === 'string' ? content : list(content).map((c) => str(obj(c).text)).join('\n')
}
function counts(before: string, after: string): { added: number; removed: number } {
  let added = 0; let removed = 0
  for (const part of diffLines(before, after)) { if (part.added) added += part.count ?? 0; if (part.removed) removed += part.count ?? 0 }
  return { added, removed }
}
interface ToolFact {
  id: string; name: string; parent: string; input: Json; status: ActivityStatus
  source?: SummaryItem; change?: SummaryItem; resultSeen?: boolean
}
export interface ActivityState {
  version: 1; revision: number; historyIncomplete: boolean
  tools: ToolFact[]; references: SummaryItem[]; projects: SummaryItem[]; tasks: SummaryItem[]
  agents: (SummaryItem & { runId?: string; taskId?: string })[]
}

export class SessionActivity {
  private tools = new Map<string, ToolFact>()
  private references = new Map<string, SummaryItem>()
  private projects = new Map<string, SummaryItem>()
  private tasks = new Map<string, SummaryItem>()
  private agents = new Map<string, SummaryItem & { runId?: string; taskId?: string }>()
  private dirty = true
  private revision = 0
  private historyIncomplete = false
  constructor(private cwd = '', saved?: ActivityState) {
    if (saved?.version === 1) {
      this.revision = saved.revision
      this.historyIncomplete = saved.historyIncomplete
      for (const key of ['tools', 'references', 'projects', 'tasks', 'agents'] as const) {
        for (const item of saved[key]) (this[key] as Map<string, { id: string }>).set(item.id, item)
      }
    }
    if (cwd) this.addProject(cwd)
  }
  private changed(): void { this.dirty = true; this.revision++ }
  private absolute(path: unknown): string { return str(path) ? resolve(this.cwd || '/', str(path)) : '' }
  private addProject(path: string, description = '会话工作目录'): void {
    if (!path || this.projects.has(path)) return
    this.projects.set(path, { id: path, title: basename(path) || path, path, description }); this.changed()
  }
  observeDirectory(path: string, current = false, description = current ? '会话工作目录' : '额外授权目录'): void {
    if (!path) return
    this.addProject(path, description)
    if (current) this.cwd = path
  }
  reference(prompt: string): void {
    // Composer 以每行一个 @路径附加文件。普通文字中的 @ 不据此推断成附件。
    for (const line of prompt.split('\n')) {
      if (!line.startsWith('@') || !line.slice(1).trim()) continue
      const reference = line.slice(1).trim()
      if (!reference.includes('/') && !/\.[a-zA-Z][a-zA-Z0-9]{0,10}$/.test(reference)) continue
      const path = this.absolute(reference)
      if (this.references.has(path)) continue
      this.references.set(path, { id: path, title: basename(path), path, description: '已引用到对话' }); this.changed()
    }
  }
  apply(raw: unknown): void {
    const message = obj(raw)
    const body = obj(message.message)
    if (message.type === 'system') {
      if (message.subtype === 'init') this.observeDirectory(str(message.cwd), true)
      if (str(message.subtype).startsWith('task_')) this.agentEvent(message)
      return
    }
    if (message.type === 'assistant') {
      for (const part of list(body.content)) {
        const block = obj(part)
        if (block.type === 'tool_use') this.tool(block, str(message.parent_tool_use_id))
      }
    }
    if (message.type === 'user') {
      if (!message.parent_tool_use_id) this.reference(text(body.content))
      for (const part of list(body.content)) {
        const block = obj(part)
        if (block.type !== 'tool_result') continue
        const tool = this.tools.get(str(block.tool_use_id))
        if (!tool || tool.resultSeen) continue
        let output = obj(message.tool_use_result)
        if (!Object.keys(output).length) {
          try { output = obj(JSON.parse(text(block.content))) } catch { /* 非结构化结果只使用可确认的信息 */ }
        }
        this.result(tool, output, text(block.content), block.is_error === true)
      }
    }
  }
  private tool(raw: Json, parent: string): void {
    const id = str(raw.id); const name = str(raw.name); const input = obj(raw.input)
    if (!id || this.tools.has(id)) return
    // 仅保留任务标题、路径等摘要字段；不复制命令、MCP 参数或文档正文。
    const safe: Json = {}
    for (const key of ['taskId', 'subject', 'description', 'status', 'method', 'subagent_type', 'run_in_background']) if (key in input) safe[key] = typeof input[key] === 'string' ? short(input[key]) : input[key]
    if (name === 'TodoWrite') safe.todos = list(input.todos).map((t) => ({ content: short(obj(t).content), status: str(obj(t).status) }))
    const fact: ToolFact = { id, name, parent, input: safe, status: 'running' }
    const path = this.absolute(input.file_path ?? input.notebook_path)
    if (name === 'Read' && path) fact.source = { id: path, title: basename(path), path, description: '读取本地文件' }
    if (name === 'WebSearch' || name === 'WebFetch') {
      fact.source = { id: 'web', title: '网页搜索', description: name === 'WebSearch' ? `搜索：${short(input.query)}` : `访问：${short(input.url)}`, url: name === 'WebFetch' ? str(input.url) : undefined }
    }
    if (name.startsWith('mcp__')) {
      const segments = name.split('__')
      const provider = segments[1] || 'MCP'
      fact.source = { id: `mcp:${provider}`, title: provider.replace(/^claude_ai_/, '').replace(/[_-]/g, ' '), description: segments.slice(2).join('__') }
    }
    if (name === 'Projects') fact.source = { id: 'claude-projects', title: 'Claude Projects', description: str(input.method) }
    if (['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(name) && path) {
      let delta: { added: number | null; removed: number | null } = { added: null, removed: null }
      if (name === 'Edit' && !input.replace_all && typeof input.old_string === 'string' && typeof input.new_string === 'string') delta = counts(input.old_string, input.new_string)
      fact.change = { id: path, title: basename(path), path, description: '会话工具修改', ...delta }
    }
    this.tools.set(id, fact)
    if (name === 'Agent' || name === 'Task') this.agents.set(id, { id, title: short(input.description) || str(input.subagent_type) || '子 Agent', description: str(input.subagent_type) || '类型未知', status: 'running' })
    this.changed()
  }
  private result(tool: ToolFact, output: Json, resultText: string, failed: boolean): void {
    tool.resultSeen = true; tool.status = failed ? 'failed' : 'completed'
    if (tool.change && !failed) {
      if (output.staged === true) tool.change = undefined
      else {
        const patch = list(output.structuredPatch).flatMap((h) => list(obj(h).lines)).map(str)
        if (patch.length) {
          tool.change.added = patch.filter((l) => l.startsWith('+')).length
          tool.change.removed = patch.filter((l) => l.startsWith('-')).length
        } else if (typeof output.originalFile === 'string' && typeof output.content === 'string') Object.assign(tool.change, counts(output.originalFile, output.content))
        else if (output.userModified === true) { tool.change.added = null; tool.change.removed = null }
        else if (tool.name === 'Write' && output.type === 'create' && typeof output.content === 'string') Object.assign(tool.change, counts('', output.content))
      }
    }
    if (!failed && tool.name === 'WebSearch' && tool.source) {
      tool.source.links = list(output.results).flatMap((r) => list(obj(r).content)).flatMap((r) => {
        const hit = obj(r); const url = str(hit.url)
        return /^https?:\/\//i.test(url) ? [{ title: short(hit.title) || url, url }] : []
      }).slice(0, 100)
    }
    if (!failed) this.taskResult(tool, output, resultText)
    const agent = this.agents.get(tool.id)
    if (agent && !terminal(agent.status)) {
      const background = tool.input.run_in_background === true || output.isAsync === true || Boolean(output.task_id)
      agent.status = failed ? 'failed' : background ? 'running' : 'completed'
      if (str(output.agentId) || str(output.task_id)) agent.taskId = str(output.task_id) || str(output.agentId)
    }
    this.changed()
  }
  private taskResult(tool: ToolFact, output: Json, resultText: string): void {
    const namespace = tool.parent || 'main'
    const upsert = (id: string, patch: Partial<SummaryItem>): void => {
      const key = `${namespace}:${id}`
      this.tasks.set(key, { id: key, title: `任务 ${id}`, description: '', status: 'unknown', ...this.tasks.get(key), ...patch })
    }
    if (tool.name === 'TaskCreate') {
      const task = obj(output.task)
      const id = str(task.id) || /Task #(\d+) created/i.exec(resultText)?.[1]
      if (id) upsert(id, { title: str(task.subject) || str(tool.input.subject), description: str(tool.input.description), status: 'pending' })
      else upsert(`tool:${tool.id}`, { title: str(tool.input.subject) || '任务', description: '任务 ID 未记录', status: 'unknown' })
    }
    if (tool.name === 'TaskUpdate' && str(tool.input.taskId) && output.success !== false) {
      const id = str(tool.input.taskId)
      if (tool.input.status === 'deleted') this.tasks.delete(`${namespace}:${id}`)
      else upsert(id, { ...(tool.input.status ? { status: status(tool.input.status) } : {}), ...(tool.input.subject ? { title: str(tool.input.subject) } : {}), ...(tool.input.description ? { description: str(tool.input.description) } : {}) })
    }
    if (tool.name === 'TaskList' || tool.name === 'TaskGet') {
      for (const item of tool.name === 'TaskGet' ? [output.task] : list(output.tasks)) {
        const task = obj(item)
        if (str(task.id)) upsert(str(task.id), { title: str(task.subject), description: short(task.description), status: status(task.status) })
      }
    }
    if (tool.name === 'TodoWrite') {
      for (const key of this.tasks.keys()) if (key.startsWith(`${namespace}:todo:`)) this.tasks.delete(key)
      list(tool.input.todos).forEach((value, i) => {
        const todo = obj(value); upsert(`todo:${i}`, { title: str(todo.content), description: '待办清单', status: status(todo.status) })
      })
    }
    if (tool.name === 'Projects' && output.method === 'project_info' && str(output.name)) {
      const id = `remote:${str(output.name)}`
      this.projects.set(id, { id, title: str(output.name), description: short(output.description) || 'Claude Projects 项目' })
    }
  }
  private agentEvent(event: Json): void {
    const taskId = str(event.task_id)
    const id = str(event.tool_use_id) || [...this.agents.values()].find((a) => a.taskId === taskId)?.id || `task:${taskId}`
    const existing = this.agents.get(id)
    // Shell、监控、MCP 后台任务不是子代理。
    if (!existing && event.task_type !== 'local_agent' && !event.subagent_type) return
    const runId = str(event.run_id)
    if (existing?.runId && runId && runId < existing.runId) return
    if (terminal(existing?.status) && (!runId || existing?.runId === runId) && event.subtype !== 'task_notification') return
    const agent = existing ?? { id, title: short(event.description) || '子 Agent', description: str(event.subagent_type) || '类型未知' }
    agent.taskId = taskId; agent.runId = runId || agent.runId
    if (event.description) agent.title = short(event.description)
    if (event.summary) agent.description = short(event.summary)
    agent.status = event.subtype === 'task_notification' ? status(event.status) : event.subtype === 'task_updated' ? status(obj(event.patch).status ?? agent.status) : 'running'
    this.agents.set(id, agent); this.changed()
  }
  finishHistory(incomplete: boolean): void {
    this.historyIncomplete ||= incomplete
    this.markInactive()
  }
  markInactive(): void {
    for (const tool of this.tools.values()) if (tool.status === 'running') tool.status = 'unknown'
    for (const agent of this.agents.values()) if (agent.status === 'running') agent.status = 'unknown'
    this.changed()
  }
  export(): ActivityState {
    return structuredClone({ version: 1, revision: this.revision, historyIncomplete: this.historyIncomplete, tools: [...this.tools.values()], references: [...this.references.values()], projects: [...this.projects.values()], tasks: [...this.tasks.values()], agents: [...this.agents.values()] })
  }
  takeChanged(): SessionSummaryData | null {
    if (!this.dirty) return null
    this.dirty = false
    return this.snapshot()
  }
  snapshot(): SessionSummaryData {
    const sources = new Map<string, SummaryItem>([...this.references].map(([id, value]) => [id, { ...value, details: [value.description] }]))
    const changes = new Map<string, SummaryItem>()
    const sourceCalls = new Map<string, ToolFact[]>()
    for (const tool of this.tools.values()) {
      if (tool.source) {
        const group = sourceCalls.get(tool.source.id) ?? []; group.push(tool); sourceCalls.set(tool.source.id, group)
      }
      if (tool.status !== 'completed' || !tool.change) continue
      const change = tool.change; const previous = changes.get(change.id)
      changes.set(change.id, { ...change, added: change.added == null || previous?.added === null ? null : (previous?.added ?? 0) + change.added, removed: change.removed == null || previous?.removed === null ? null : (previous?.removed ?? 0) + change.removed })
    }
    for (const [id, calls] of sourceCalls) {
      const ref = sources.get(id)
      const succeeded = calls.filter((t) => t.status === 'completed').length
      const failed = calls.filter((t) => t.status === 'failed').length
      const details = [...(ref?.details ?? []), ...calls.map((t) => `${t.source!.description} · ${t.status === 'completed' ? '成功' : t.status === 'failed' ? '失败' : '未确认完成'}`)]
      const links = [...new Map(calls.flatMap((t) => [...(t.source?.links ?? []), ...(t.source?.url ? [{ title: t.source.description, url: t.source.url }] : [])]).map((link) => [link.url, link])).values()]
      sources.set(id, { ...calls[0].source!, links, description: `调用 ${calls.length} 次 · 成功 ${succeeded}${failed ? ` · 失败 ${failed}` : ''}`, details })
    }
    return structuredClone({ revision: this.revision, historyIncomplete: this.historyIncomplete, sections: { changes: [...changes.values()], sources: [...sources.values()], projects: [...this.projects.values()], tasks: [...this.tasks.values()], agents: [...this.agents.values()] } })
  }
}
