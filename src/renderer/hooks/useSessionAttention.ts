import { useEffect } from 'react'
import { isViewingSession, useNotice } from '../notify'
import { useOrganization } from '../organizationStore'
import { useChat } from '../chatStore'
import { useDesk } from '../store'
import { useLayout } from '../layoutStore'
export function useSessionAttention(): void {
  useEffect(() => {
    const pending = new Set<string>(),
      attempted = new Set<string>()
    let scheduled = 0,
      stopped = false
    const check = () => {
      scheduled = 0
      const view = useDesk.getState().view
      if (view.kind !== 'session' || !isViewingSession(view.sessionId)) return
      if (useNotice.getState().notice?.sessionId === view.sessionId) useNotice.setState({ notice: null })
      const attention = useOrganization.getState().value.attention[view.sessionId]
      if (!attention || attention.completed === attention.read) return
      const key = view.sessionId + ':' + attention.completed
      if (pending.has(key) || attempted.has(key)) return
      attempted.add(key)
      pending.add(key)
      void useOrganization
        .getState()
        .change({ kind: 'read', sessionId: view.sessionId, completed: attention.completed })
        .finally(() => pending.delete(key))
    }
    const schedule = () => {
      if (!stopped && !scheduled) scheduled = requestAnimationFrame(check)
    }
    const off = [
      useDesk.subscribe(schedule),
      useChat.subscribe(schedule),
      useLayout.subscribe(schedule),
      useOrganization.subscribe(schedule)
    ]
    const onFocus = () => {
      attempted.clear()
      schedule()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', schedule)
    const offChanged = window.desk.organization.onChanged((value) => useOrganization.getState().accept(value))
    void useOrganization.getState().load()
    schedule()
    return () => {
      stopped = true
      cancelAnimationFrame(scheduled)
      off.forEach((f) => f())
      offChanged()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [])
}
