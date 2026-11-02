import type { ChatActivity, ChatState } from '@shared/chat'

export type CrabPose = 'idle' | 'look' | 'sleep' | 'thinking' | 'writing' | 'working' | 'waiting' | 'error'
export interface CrabActivity { pose: CrabPose; label: string; rotating: boolean }

/** Only actual session events determine the work pose; verbs are decorative. */
function englishActivity(state: ChatState, activity?: ChatActivity): CrabActivity {
  if (state === 'error') return { pose: 'error', label: 'Error', rotating: false }
  if (activity?.phase === 'stopping' && state !== 'idle') return { pose: 'waiting', label: 'Stopping…', rotating: false }
  if (state === 'awaiting') return { pose: 'waiting', label: 'Waiting for you', rotating: false }
  if (state !== 'running') return { pose: 'idle', label: '', rotating: false }
  if (activity?.phase === 'thinking') return { pose: 'thinking', label: 'Thinking', rotating: true }
  if (activity?.phase === 'responding') return { pose: 'writing', label: 'Responding', rotating: true }
  if (activity?.phase === 'tool') {
    const name = activity.toolName
    if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(name ?? '')) return { pose: 'writing', label: 'Writing', rotating: true }
    if (name === 'Read') return { pose: 'look', label: 'Reading', rotating: true }
    if (name === 'Glob' || name === 'Grep') return { pose: 'look', label: 'Searching', rotating: true }
    if (name === 'Bash') return { pose: 'working', label: 'Running command', rotating: true }
    if (name === 'Agent' || name === 'Task') return { pose: 'working', label: 'Delegating', rotating: true }
  }
  return { pose: 'working', label: 'Working', rotating: true }
}

const LABELS_ZH: Record<string, string> = {
  Error: '出了点问题，请查看提示', 'Stopping…': '正在停止…', 'Waiting for you': '等你确认后继续',
  Thinking: '正在思考', Responding: '正在回复', Writing: '正在写入或修改', Reading: '正在读取',
  Searching: '正在查找', 'Running command': '正在运行命令', Delegating: '正在交给子代理处理', Working: '正在执行任务'
}
export function crabActivity(state: ChatState, activity?: ChatActivity, language: 'zh' | 'en' = 'en'): CrabActivity {
  const display = englishActivity(state, activity)
  return language === 'zh' ? { ...display, label: LABELS_ZH[display.label] ?? display.label } : display
}
