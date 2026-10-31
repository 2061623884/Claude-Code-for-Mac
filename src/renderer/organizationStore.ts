import { create } from 'zustand'
import { emptyOrganization, type OrganizationAction, type SessionOrganization } from '@shared/sessionOrganization'
export const useOrganization = create<{
  value: SessionOrganization
  error: string | null
  accept(value: SessionOrganization): void
  load(): Promise<void>
  change(action: OrganizationAction): Promise<void>
}>((set, get) => ({
  value: emptyOrganization(),
  error: null,
  accept(value) {
    if (value.revision >= get().value.revision) set({ value })
  },
  async load() {
    try {
      get().accept(await window.desk.organization.get())
    } catch (e) {
      set({ error: String(e) })
    }
  },
  async change(action) {
    try {
      get().accept(await window.desk.organization.change(action))
      set({ error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  }
}))
