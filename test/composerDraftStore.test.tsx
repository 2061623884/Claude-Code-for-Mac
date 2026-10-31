import { beforeEach, expect, it } from 'vitest'
import { useComposerDrafts } from '../src/renderer/composerDraftStore'
beforeEach(() => useComposerDrafts.setState({ drafts: {}, edits: {} }))
it('keeps the ordinary draft and attachments intact throughout queue editing and session switches', () => {
  const s = useComposerDrafts.getState()
  const attachments = [{ path: '/a.png', name: 'a.png', extension: 'png', bytes: 1 }]
  s.updateDraft('one', { text: 'unsent draft', attachments })
  s.beginEdit('one', { id: 'q', text: 'queued original', status: 'queued', options: { model: 'sonnet', effort: 'low', mode: 'default' } })
  s.updateEdit('one', { text: 'edited queue content' })
  s.updateDraft('two', { text: 'other session draft' })
  expect(useComposerDrafts.getState().edits.one.text).toBe('edited queue content')
  s.finishEdit('one')
  expect(useComposerDrafts.getState().drafts.one).toEqual({ text: 'unsent draft', attachments })
  expect(useComposerDrafts.getState().drafts.two.text).toBe('other session draft')
  s.updateEdit('one', { text: 'late editor callback' })
  expect(useComposerDrafts.getState().edits.one).toBeUndefined()
})
