import { expect, it } from 'vitest'
import { TurnActivity } from '../src/main/live/TurnActivity'
import { Transcript } from '../src/main/transcript'
it('tracks the actual streaming block even when its message precedes the last tool message', () => {
  const t = new Transcript(), a = new TurnActivity()
  a.start()
  const apply = (m: unknown) => { a.apply(m); t.apply(m, 'live'); a.locate(t.messages, m) }
  apply({ type: 'stream_event', event: { type: 'message_start', message: { id: 'text' } } })
  apply({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'working' } } })
  apply({ type: 'assistant', message: { id: 'tool', content: [{ type: 'tool_use', id: 'read', name: 'Read', input: {} }] } })
  expect(a.snapshot()).toMatchObject({ messageId: 'tool', blockIndex: 0 })
  apply({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'read', content: 'done' }] } })
  apply({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'new text' } } })
  expect(a.snapshot()).toMatchObject({ messageId: 'text', blockIndex: 0, phase: 'responding' })
  t.addUser('inserted')
  apply({ type: 'assistant', parent_tool_use_id: 'sub', message: { id: 'child', content: [{ type: 'text', text: 'child' }] } })
  expect(a.snapshot().messageId).toBe('text')
  a.finish(); expect(a.snapshot().messageId).toBeUndefined()
})
