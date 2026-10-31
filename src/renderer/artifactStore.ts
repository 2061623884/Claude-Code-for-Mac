import { create } from 'zustand'
import type { ArtifactSnapshot } from '@shared/artifacts'
export const useArtifacts = create<{
  value: ArtifactSnapshot
  error: string | null
  load(): Promise<void>
  act(action: () => Promise<void>): Promise<void>
}>((set, get) => ({
  value: { revision: -1, items: [] },
  error: null,
  async load() {
    try {
      const value = await window.desk.artifacts.list()
      if (value.revision >= get().value.revision) set({ value, error: null })
    } catch (e) {
      set({ error: String(e) })
    }
  },
  async act(action) {
    try {
      await action()
      await get().load()
    } catch (e) {
      set({ error: String(e) })
    }
  }
}))
