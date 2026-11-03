import type { SessionOptions } from './chat'
const efforts = new Set(['low', 'medium', 'high', 'xhigh', 'max'])
export function sessionCommand(text: string): Partial<SessionOptions> | null {
  const ultra = /^\/effort\s+ultracode(?:\s+(on|off))?\s*$/.exec(text.trim())
  if (ultra) return { ultracode: ultra[1] !== 'off' }
  const match = /^\/(model|effort)\s+(\S+)\s*$/.exec(text.trim())
  if (!match) return null
  const value = ['auto', 'default'].includes(match[2]) ? null : match[2]
  if (match[1] === 'model') return { model: value }
  if (value === null || efforts.has(value)) return { effort: value as SessionOptions['effort'] }
  return null
}
