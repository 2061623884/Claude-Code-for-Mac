import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Activity, Bot, ChevronRight, Plug, Square, SquareTerminal, Workflow, type LucideIcon } from 'lucide-react'
import type { BackgroundTask, BackgroundTaskStatus } from '@shared/chat'
import { formatClock, formatDuration, formatTokens } from '@shared/format'
import { useChat } from '../../chatStore'

const TYPES: Record<string, { label: string; icon: LucideIcon }> = {
  local_bash: { label: '后台命令', icon: SquareTerminal },
  local_agent: { label: '子 Agent', icon: Bot },
  local_monitor: { label: '监控', icon: Activity },
  local_workflow: { label: '工作流', icon: Workflow },
  mcp_task: { label: 'MCP 任务', icon: Plug }
}
const FALLBACK = { label: '后台任务', icon: Activity }
export const taskType = (task: BackgroundTask) => TYPES[task.type ?? ''] ?? FALLBACK
export const TASK_STATUS: Record<BackgroundTaskStatus, string> = { running: '运行中', completed: '已完成', failed: '失败', stopped: '已停止', ended: '已结束' }
const AGENT_STATES: Record<string, string> = { running: '运行中', queued: '等待中', pending: '等待中', done: '已完成', completed: '已完成', failed: '失败', error: '失败', stopped: '已停止' }
/** 只有这几类任务能读到输出；子 Agent 的结果会回到对话里 */
const HAS_OUTPUT = new Set(['local_bash', 'local_monitor', 'local_workflow'])
const NO_TASKS: BackgroundTask[] = []

/** 运行中的任务每秒刷新一次时长 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

export const taskDuration = (task: BackgroundTask, now: number): string => formatDuration((task.endedAt ?? now) - task.startedAt)

export function TaskStatus({ task, now }: { task: BackgroundTask; now: number }) {
  const tone = task.status === 'running' ? 'text-accent' : task.status === 'failed' ? 'text-danger' : 'text-fg3'
  return <span className={`shrink-0 whitespace-nowrap text-[12px] tabular-nums ${tone}`}>{TASK_STATUS[task.status]} · {taskDuration(task, now)}</span>
}

export function BackgroundTasksPane({ sessionId, cwd, taskId, active }: { sessionId: string; cwd: string; taskId?: string; active: boolean }) {
  const tasks = useChat((s) => s.chats[sessionId]?.tasks ?? NO_TASKS)
  const [selected, setSelected] = useState(taskId)
  useEffect(() => { if (taskId) setSelected(taskId) }, [taskId])
  const now = useNow(active && tasks.some((t) => t.status === 'running'))
  const running = tasks.filter((t) => t.status === 'running').length
  return <section aria-label="后台任务" className="flex h-full flex-col">
    <div className="shrink-0 border-b border-line px-5 py-3">
      <h2 className="text-[15px] font-medium">后台任务</h2>
      <p className="mt-1 text-[12px] text-fg3">{running ? `${running} 个运行中` : '没有运行中的任务'}{tasks.length > running ? ` · ${tasks.length - running} 个已结束` : ''}</p>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      {!tasks.length && <p className="px-2 py-4 text-[13px] text-fg3">暂无后台任务</p>}
      {tasks.map((task) => {
        const open = task.id === selected
        const { icon: Icon } = taskType(task)
        return <div key={task.id} className="border-b border-line last:border-0">
          <button type="button" aria-expanded={open} onClick={() => setSelected(open ? undefined : task.id)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left hover:bg-hover">
            <Icon size={16} className={`shrink-0 ${task.status === 'running' ? 'text-accent' : 'text-fg2'}`} />
            <span className="min-w-0 flex-1 truncate" title={task.description}>{task.description}</span>
            <TaskStatus task={task} now={now} />
            <ChevronRight size={14} className={`shrink-0 text-fg3 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
          </button>
          {open && <TaskDetail sessionId={sessionId} cwd={cwd} task={task} active={active} />}
        </div>
      })}
    </div>
  </section>
}

function TaskDetail({ sessionId, cwd, task, active }: { sessionId: string; cwd: string; task: BackgroundTask; active: boolean }) {
  const [output, setOutput] = useState<{ text: string; truncated?: boolean } | null>(null)
  const [error, setError] = useState('')
  const [stopping, setStopping] = useState(false)
  const box = useRef<HTMLPreElement>(null)
  const pinned = useRef(true)
  const readable = HAS_OUTPUT.has(task.type ?? '')
  const running = task.status === 'running'

  useEffect(() => { setOutput(null); setError(''); pinned.current = true }, [sessionId, cwd, task.id, task.runId])

  // 运行中每 2 秒读一次输出；结束后再读最后一次
  useEffect(() => {
    if (!readable || !active) return
    let stale = false
    let loading = false
    const load = async (): Promise<void> => {
      if (loading) return
      loading = true
      try {
        const value = await window.desk.chat.taskOutput(sessionId, cwd, task.id)
        if (stale) return
        setOutput({ text: task.type === 'local_workflow' ? formatTaskOutput(value?.output ?? '') : value?.output ?? '', truncated: value?.truncated })
        setError('')
      } catch (e) { if (!stale) setError(e instanceof Error ? e.message : String(e)) }
      finally { loading = false }
    }
    void load()
    const timer = running ? setInterval(() => void load(), 2000) : undefined
    return () => { stale = true; clearInterval(timer) }
  }, [sessionId, cwd, task.id, task.runId, task.type, readable, running, active])

  // 停在底部时跟随新输出；往上翻看时不打扰
  useLayoutEffect(() => {
    const el = box.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [output?.text])

  const stop = async (): Promise<void> => {
    setStopping(true)
    try { await window.desk.chat.stopTask(sessionId, cwd, task.id) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setStopping(false) }
  }

  const facts = [
    taskType(task).label,
    `开始于 ${formatClock(task.startedAt)}`,
    task.tokens ? `${formatTokens(task.tokens)} tokens` : '',
    task.toolUses ? `${task.toolUses} 次工具调用` : '',
    running && task.lastTool ? `正在用 ${task.lastTool}` : ''
  ].filter(Boolean)
  return <div className="space-y-3 px-2 pb-4 pl-[34px] text-[13px]">
    <p className="text-[12px] text-fg3">{facts.join(' · ')}</p>
    {task.summary && <p className="break-words text-fg2">{task.summary}</p>}
    {!!task.agents.length && <ul className="space-y-1" aria-label="子代理进度">{task.agents.map((agent) => <li key={agent.id} className="flex justify-between gap-3 text-[12px]">
      <span className="min-w-0 truncate">{agent.label ?? agent.id}</span><span className="shrink-0 text-fg2">{AGENT_STATES[agent.state ?? ''] ?? agent.state ?? '等待中'}</span>
    </li>)}</ul>}
    {running && <button type="button" disabled={stopping} onClick={() => void stop()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-chip px-3 py-1.5 text-danger hover:bg-hover disabled:opacity-40"><Square size={12} fill="currentColor" />{stopping ? '正在停止…' : '停止任务'}</button>}
    {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
    {readable ? output && <div>
      {output.truncated && <p className="mb-1 text-[11.5px] text-fg3">只显示最后 8 KB 输出</p>}
      <pre ref={box} aria-label="任务输出" onScroll={(e) => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24 }}
        className="max-h-[50vh] select-text overflow-auto whitespace-pre-wrap break-all rounded-xl border border-line bg-card p-3 font-mono text-[12px] leading-relaxed">{output.text || (running ? '还没有输出' : '没有输出')}</pre>
    </div>
      : task.type === 'local_agent' && <p className="text-[12px] text-fg3">子 Agent 完成后，结果会回到对话里。</p>}
  </div>
}

export function formatTaskOutput(output: string): string {
  try {
    const value = JSON.parse(output)
    if (typeof value.agentCount !== 'number' || !('result' in value)) return output
    const agents = Array.isArray(value.workflowProgress) ? value.workflowProgress.filter((item: any) => item.type === 'workflow_agent') : []
    const render = (result: unknown) => typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    const results = Array.isArray(value.result)
      ? value.result.map((result: unknown, index: number) => `${agents[index]?.label ?? `子代理 ${index + 1}`}\n${render(result)}`).join('\n\n')
      : render(value.result)
    return [value.summary, results, Array.isArray(value.logs) && value.logs.length ? `执行日志\n${value.logs.join('\n')}` : ''].filter(Boolean).join('\n\n')
  } catch { return output }
}
