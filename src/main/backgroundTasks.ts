import type { BackgroundTask, BackgroundTaskStatus } from '../shared/chat'

const STATUSES: Record<string, BackgroundTaskStatus> = { running: 'running', pending: 'running', completed: 'completed', failed: 'failed', stopped: 'stopped', killed: 'stopped', ended: 'ended' }

/** 只给界面看后台任务：前台阻塞的子 Agent 和 CLI 内部的整理任务（ambient）不算 */
export function isBackgroundTask(task: Record<string, any>): boolean {
  if (task.ambient || task.skip_transcript) return false
  return task.backgrounded === true || task.is_backgrounded !== false
}

/** Only UI-relevant fields cross IPC; full prompts and internal script data stay in main. */
export function backgroundTaskView(task: Record<string, any>): BackgroundTask {
  const status = STATUSES[String(task.status)] ?? 'running'
  const usage = task.usage && typeof task.usage === 'object' ? task.usage : undefined
  return {
    id: task.task_id,
    ...(typeof task.run_id === 'string' ? { runId: task.run_id } : {}),
    type: task.task_type,
    description: task.description || task.task_id,
    status,
    startedAt: task.startedAt ?? Date.now(),
    ...(task.endedAt ? { endedAt: task.endedAt } : {}),
    ...(typeof usage?.total_tokens === 'number' ? { tokens: usage.total_tokens } : {}),
    ...(typeof usage?.tool_uses === 'number' ? { toolUses: usage.tool_uses } : {}),
    ...(typeof task.last_tool_name === 'string' ? { lastTool: task.last_tool_name } : {}),
    ...(typeof task.summary === 'string' && task.summary ? { summary: task.summary } : {}),
    agents: Array.isArray(task.workflow_progress) ? task.workflow_progress
      .filter((item: any) => item.type === 'workflow_agent')
      .map((item: any) => {
        const active = ['start', 'progress', 'running', 'queued', 'pending'].includes(item.state)
        const state = active && status === 'stopped' ? 'stopped'
          : item.state === 'start' && !item.startedAt ? 'queued'
          : ['start', 'progress'].includes(item.state) ? 'running' : item.state
        return { id: item.agentId ?? String(item.index), label: item.label, state, tokens: item.tokens }
      }) : []
  }
}

/** 最多保留的已结束任务数，运行中的全部保留 */
const KEEP_FINISHED = 20

export function backgroundTaskList(tasks: Iterable<Record<string, any>>): BackgroundTask[] {
  const views = [...tasks].filter(isBackgroundTask).map(backgroundTaskView)
  const running = views.filter(t => t.status === 'running').sort((a, b) => b.startedAt - a.startedAt)
  const finished = views.filter(t => t.status !== 'running').sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
  return [...running, ...finished.slice(0, KEEP_FINISHED)]
}

const ESCAPES = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-B]/g
/** 命令输出原样带着终端控制符；去掉颜色等转义，进度条这类用 \r 覆盖的行只留最后一次 */
export function plainTerminalText(text: string): string {
  return text.replace(ESCAPES, '').split('\n').map(line => line.replace(/\r+$/, '').split('\r').pop()).join('\n')
}
