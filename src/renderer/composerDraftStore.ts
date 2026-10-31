import { create } from 'zustand'
import type { ComposerAttachment } from '@shared/attachments'
import type { QueuedMessage } from '@shared/chat'
export interface ComposerDraft { text: string; attachments: ComposerAttachment[] }
export interface QueueEditDraft extends ComposerDraft { id: string; originalPaths: string[] }
export const EMPTY_DRAFT: ComposerDraft = { text: '', attachments: [] }
interface DraftStore {
  drafts: Record<string, ComposerDraft>
  edits: Record<string, QueueEditDraft>
  updateDraft(sessionId: string, patch: Partial<ComposerDraft>): void
  beginEdit(sessionId: string, item: QueuedMessage): void
  updateEdit(sessionId: string, patch: Partial<ComposerDraft>): void
  finishEdit(sessionId: string): void
}
/** 普通草稿与队列编辑稿分开，切换会话或保存/取消编辑时不互相覆盖。 */
export const useComposerDrafts = create<DraftStore>((set) => ({
  drafts: {}, edits: {},
  updateDraft: (id, patch) => set(s => ({ drafts: { ...s.drafts, [id]: { ...(s.drafts[id] ?? EMPTY_DRAFT), ...patch } } })),
  beginEdit: (id, item) => set(s => ({ edits: { ...s.edits, [id]: { id: item.id, text: item.text, attachments: [], originalPaths: item.attachments ?? [] } } })),
  updateEdit: (id, patch) => set(s => s.edits[id] ? { edits: { ...s.edits, [id]: { ...s.edits[id], ...patch } } } : s),
  finishEdit: id => set(s => { const edits = { ...s.edits }; delete edits[id]; return { edits } })
}))
