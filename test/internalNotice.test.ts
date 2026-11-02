import { expect, it } from 'vitest'
import { Transcript } from '../src/main/transcript'
import { groupTechnicalNotices, internalNoticeKind } from '../src/shared/internalNotice'
import type { UiMessage } from '../src/shared/chat'
const msg = (id: string, internalKind: UiMessage['internalKind'] = 'technical', text = 'metadata'): UiMessage => ({ id, role: 'notice', source: 'internal', internalKind, blocks: [{ kind: 'text', text }], parentToolUseId: null })
const event = (uuid: string, text: string, flags: object) => ({ type: 'user', uuid, parent_tool_use_id: null, message: { role: 'user', content: text }, ...flags })
it('merges consecutive metadata while preserving messages and boundaries', () => {
  const a = msg('a'), b = msg('b'), reply: UiMessage = { ...msg('reply'), role: 'assistant', source: undefined }, c = msg('c')
  const messages = [a, b, reply, c]
  expect(groupTechnicalNotices(messages)).toEqual([{ kind: 'technical', messages: [a,b] }, { kind: 'message', message: reply }, { kind: 'technical', messages: [c] }])
  expect(messages).toHaveLength(4)
})
it('surfaces synthetic notifications and old snapshots conservatively', () => {
  const old = msg('old'); delete old.internalKind
  expect(internalNoticeKind(old)).toBe('notification')
  const t = new Transcript()
  t.apply(event('synthetic', 'Action needed: sign in again', { isSynthetic: true, isMeta: true }), 'live')
  expect(t.messages[0]).toMatchObject({ source: 'internal', internalKind: 'notification' })
})
it.each(['API Error: 500', 'Warning: authentication expired', 'Permission denied', '请求失败：连接中断', '需要授权才能继续'])('keeps metadata diagnostic visible: %s', text => {
  expect(internalNoticeKind(msg('error', 'technical', text))).toBe('notification')
})
it('does not classify humans or external task notifications from their text', () => {
  const t = new Transcript()
  t.apply(event('human', '<command-name>/model</command-name>', { origin: { kind: 'human' } }))
  t.apply(event('task', 'done', { origin: { kind: 'task-notification' }, isMeta: true }))
  expect(t.messages[0]).toMatchObject({ source: 'human', role: 'user' })
  expect(t.messages[1]).toMatchObject({ source: 'external', originKind: 'task-notification' })
  expect(t.messages.every(m => m.internalKind === undefined)).toBe(true)
})
it('preserves compact summaries without interpreting quoted commands', () => {
  const t = new Transcript()
  t.apply(event('summary', 'Summary mentions <command-name>/model</command-name>', { isCompactSummary: true, origin: { kind: 'human' } }))
  t.finish()
  expect(t.messages).toHaveLength(1)
  expect(t.messages[0]).toMatchObject({ internalKind: 'compact', startsTurn: false })
})
it('keeps raw command provenance but displays only the command card', () => {
  const t = new Transcript()
  t.apply(event('cmd', '<command-name>/model</command-name><command-args>sonnet</command-args>', { isMeta: true }))
  t.apply(event('out', '<local-command-stdout>Set model to sonnet</local-command-stdout>', { isMeta: true }))
  t.finish()
  expect(t.messages[0]).toMatchObject({ internalKind: 'command', source: 'internal' })
  expect(groupTechnicalNotices(t.messages)).toHaveLength(1)
  expect(t.messages[1].blocks[0]).toMatchObject({ kind: 'command', name: 'model', output: 'Set model to sonnet' })
})
it('classifies live and history metadata consistently', () => {
  for (const flags of [{ isMeta: true }, { is_meta: true }, { isVisibleInTranscriptOnly: true }]) {
    const t = new Transcript()
    t.apply(event('meta', 'internal context', flags))
    expect(t.messages[0]).toMatchObject({ internalKind: 'technical', source: 'internal', startsTurn: false })
  }
})
