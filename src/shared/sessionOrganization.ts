export interface SessionSection {
  id: string
  title: string
  collapsed: boolean
  sessions: string[]
}
export interface SessionOrganization {
  revision: number
  pinned: string[]
  sections: SessionSection[]
  attention: Record<string, { completed: string; read?: string; seen?: string[] }>
}
export const emptyOrganization = (): SessionOrganization => ({ revision: 0, pinned: [], sections: [], attention: {} })
export type OrganizationAction =
  | { kind: 'pin'; sessionId: string; pinned: boolean; before?: string }
  | { kind: 'move'; sessionId: string; sectionId: string | null; before?: string }
  | { kind: 'create'; id: string; title: string }
  | { kind: 'rename'; id: string; title: string }
  | { kind: 'collapse'; id: string; collapsed: boolean }
  | { kind: 'remove'; id: string }
  | { kind: 'reorder'; id: string; before?: string }
  | { kind: 'read'; sessionId: string; completed: string }
export function sectionFor(org: SessionOrganization, id: string): SessionSection | undefined {
  return org.sections.find((s) => s.sessions.includes(id))
}
export function isUnread(org: SessionOrganization, id: string): boolean {
  const a = org.attention[id]
  return Boolean(a && a.completed !== a.read)
}
const identifier = (s: unknown): string => {
  if (typeof s !== 'string' || !/^[\w-]{1,100}$/.test(s)) throw new Error('无效标识')
  return s
}
function insert(list: string[], id: string, before?: string): string[] {
  if (before === id) return list
  const next = list.filter((x) => x !== id),
    at = before ? next.indexOf(before) : -1
  next.splice(at < 0 ? next.length : at, 0, id)
  return next
}
export function updateOrganization(current: SessionOrganization, action: OrganizationAction): SessionOrganization {
  const next = structuredClone(current)
  if (!action || typeof action !== 'object') throw new Error('无效操作')
  if ('sessionId' in action) identifier(action.sessionId)
  if ('id' in action) identifier(action.id)
  if ('before' in action && action.before !== undefined) identifier(action.before)
  const title = (): string => {
    const value = 'title' in action && typeof action.title === 'string' ? action.title.trim().slice(0, 100) : ''
    if (!value) throw new Error('分区名称不能为空')
    return value
  }
  const section = () => {
    const s = next.sections.find((s) => 'id' in action && s.id === action.id)
    if (!s) throw new Error('分区不存在')
    return s
  }
  switch (action.kind) {
    case 'create':
      if (next.sections.some((s) => s.id === action.id)) throw new Error('分区已存在')
      next.sections.push({ id: action.id, title: title(), collapsed: false, sessions: [] })
      break
    case 'rename':
      section().title = title()
      break
    case 'collapse':
      section().collapsed = action.collapsed === true
      break
    case 'remove':
      next.sections = next.sections.filter((s) => s.id !== action.id)
      break
    case 'reorder': {
      const s = section()
      const ids = insert(
        next.sections.map((x) => x.id),
        s.id,
        action.before
      )
      next.sections = ids.map((id) => next.sections.find((x) => x.id === id)!)
      break
    }
    case 'pin':
      next.pinned =
        action.pinned === true
          ? insert(next.pinned, action.sessionId, action.before)
          : next.pinned.filter((id) => id !== action.sessionId)
      break
    case 'move': {
      const target = action.sectionId === null ? null : next.sections.find((s) => s.id === action.sectionId)
      if (action.sectionId !== null && !target) throw new Error('分区不存在')
      if (action.before === action.sessionId) return current
      next.sections.forEach((s) => {
        s.sessions = s.sessions.filter((id) => id !== action.sessionId)
      })
      if (target) target.sessions = insert(target.sessions, action.sessionId, action.before)
      break
    }
    case 'read': {
      const a = next.attention[action.sessionId]
      if (!a || a.completed !== action.completed || a.read === action.completed) return current
      a.read = a.completed
      break
    }
    default:
      throw new Error('不支持的操作')
  }
  next.revision++
  return next
}
export function recordCompletion(current: SessionOrganization, id: string, eventId: string): SessionOrganization {
  if (current.attention[id]?.completed === eventId || current.attention[id]?.seen?.includes(eventId)) return current
  return {
    ...current,
    revision: current.revision + 1,
    attention: {
      ...current.attention,
      [id]: {
        ...current.attention[id],
        completed: eventId,
        seen: [...(current.attention[id]?.seen ?? []), eventId].slice(-128)
      }
    }
  }
}
