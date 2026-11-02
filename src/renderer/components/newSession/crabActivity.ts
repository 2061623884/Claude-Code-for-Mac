import type { ChatActivity, ChatState } from '@shared/chat'

export type CrabPose = 'idle' | 'look' | 'sleep' | 'thinking' | 'writing' | 'working' | 'waiting' | 'error'
export interface CrabActivity { pose: CrabPose; label: string; rotating: boolean }

/** Only actual session events determine the work pose; verbs are decorative. */
export function crabActivity(state: ChatState, activity?: ChatActivity): CrabActivity {
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
