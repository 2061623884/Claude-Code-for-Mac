import { create } from 'zustand'
import type { UsageOverview, UsageProfile } from '@shared/usageAnalytics'

interface State {
  overview: UsageOverview | null
  loading: boolean
  error: string | null
  failures: number
  lastAttempt: number
  refresh(): Promise<void>
  saveProfile(profile: UsageProfile): Promise<void>
}
let pending: Promise<void> | null = null
let profileRevision = 0
export const useUsage = create<State>((set, get) => ({
  overview: null, loading: false, error: null, failures: 0, lastAttempt: 0,
  refresh() {
    if (pending) return pending
    set({ loading: true, lastAttempt: Date.now() })
    const revision = profileRevision
    pending = window.desk.usage.overview().then(overview => {
      const previous = get().overview
      const sameAccount = previous?.account.key === overview.account.key
      if (sameAccount && revision !== profileRevision) overview.profile = previous!.profile
      if (overview.usageError && sameAccount) { overview.usage = previous!.usage; overview.updatedAt = previous!.updatedAt }
      set({ overview, error: overview.usageError ?? null, failures: overview.usageError ? get().failures + 1 : 0 })
    }, error => set({ error: String(error.message ?? error), failures: get().failures + 1 })).finally(() => { pending = null; set({ loading: false }) })
    return pending
  },
  async saveProfile(profile) {
    const previous = get().overview
    if (!previous) return
    const saved = await window.desk.usage.saveProfile(previous.account.key, profile)
    profileRevision++
    const current = get().overview
    if (current?.account.key === previous.account.key) set({ overview: { ...current, profile: saved } })
  }
}))

/** One shared foreground poll for sidebar and page. Focus checks do not bypass backoff. */
export function startUsagePolling(): () => void {
  let stopped = false
  // Let the model handshake start before the sidebar opens another CLI to fetch quota.
  const firstPoll = Date.now() + 5000
  const tick = (): void => {
    if (stopped || document.hidden || !document.hasFocus() || Date.now() < firstPoll) return
    const state = useUsage.getState()
    const interval = Math.min(300000, 60000 * 2 ** Math.min(state.failures, 3))
    if (!state.lastAttempt || Date.now() - state.lastAttempt >= interval) void state.refresh()
  }
  const timer = window.setInterval(tick, 5000)
  window.addEventListener('focus', tick)
  document.addEventListener('visibilitychange', tick)
  return () => { stopped = true; clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick) }
}
