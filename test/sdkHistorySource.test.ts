import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { getSessionMessages, type SessionStoreEntry } from '@anthropic-ai/claude-agent-sdk'
import { Transcript } from '../src/main/transcript'

// 使用已安装的 SDK 0.3.301 真正读取 SessionStore，不 mock 历史转换器、不启动模型。
it('retains provenance through the actual SDK history reader, including is_meta', async () => {
  const sessionId = randomUUID()
  const entries: SessionStoreEntry[] = []
  const add = (text: string, flags: Record<string, unknown>) => {
    const uuid = randomUUID()
    entries.push({ type: 'user', uuid, parentUuid: entries.at(-1)?.uuid ?? null, sessionId, timestamp: new Date().toISOString(), message: { role: 'user', content: text }, ...flags })
    return uuid
  }
  const human = add('<system-reminder>真人原文</system-reminder>', { origin: { kind: 'human' } })
  add('普通内部说明', { isMeta: true })
  const summary = add('压缩摘要', { isCompactSummary: true })
  const visible = add('内部记录', { isVisibleInTranscriptOnly: true })
  const peer = add('其他 Agent 消息', { origin: { kind: 'peer', from: 'another' }, isMeta: true })
  const legacy = add('旧消息原文', {})
  const rows = await getSessionMessages(sessionId, { dir: '/tmp/message-provenance-test', sessionStore: { load: async () => entries, append: async () => {} } })
  expect(rows.find(r => r.uuid === human)).toMatchObject({ origin: { kind: 'human' } })
  expect(rows.find(r => r.uuid === summary)).toMatchObject({ is_meta: true, isCompactSummary: true })
  expect(rows.find(r => r.uuid === visible)).toMatchObject({ is_meta: true })
  expect(rows.find(r => r.uuid === peer)).toMatchObject({ origin: { kind: 'peer' }, is_meta: true })
  const t = new Transcript()
  rows.forEach(r => t.apply(r))
  expect(t.messages.find(m => m.id === human)).toMatchObject({ source: 'human', startsTurn: true, blocks: [{ kind: 'text', text: '<system-reminder>真人原文</system-reminder>' }] })
  expect(t.messages.find(m => m.id === summary)).toMatchObject({ source: 'internal', startsTurn: false })
  expect(t.messages.find(m => m.id === visible)).toMatchObject({ source: 'internal', startsTurn: false })
  expect(t.messages.find(m => m.id === legacy)).toMatchObject({ source: 'unknown', startsTurn: true })
})
