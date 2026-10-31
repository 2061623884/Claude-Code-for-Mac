import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SessionManager } from '../src/main/live/SessionManager'
import { PushQueue } from '../src/main/live/PushQueue'
import { createSessionPreferencesRepository } from '../src/main/sessionPreferences'
const sdk = vi.hoisted(() => ({ query: vi.fn(), getSessionMessages: vi.fn() }))
vi.mock('../src/main/sdk', () => ({ loadSdk: async () => sdk, claudeExecutable: () => undefined }))
vi.mock('../src/main/store', () => ({ read: () => ({ settings: { allowBypass: false, defaultModel: 'sonnet', defaultEffort: 'low', defaultPermissionMode: 'default' } }) }))
const options = { model: 'sonnet', effort: 'low' as const, mode: 'default' as const }
let manager: SessionManager, root: string
const emit = vi.fn()
const setup = () => new SessionManager(emit, undefined, undefined, undefined, createSessionPreferencesRepository(() => root))
beforeEach(() => {
  vi.clearAllMocks(); root = mkdtempSync(join(tmpdir(), 'session-queue-'))
  sdk.getSessionMessages.mockResolvedValue([])
  sdk.query.mockImplementation(() => {
    const stream = new PushQueue<unknown>()
    return Object.assign(stream, { close: () => stream.end(), interrupt: vi.fn().mockResolvedValue(undefined), setModel: vi.fn().mockResolvedValue(undefined), setPermissionMode: vi.fn().mockResolvedValue(undefined), applyFlagSettings: vi.fn().mockResolvedValue(undefined) })
  })
  manager = setup()
})
afterEach(() => { manager.closeAll(); rmSync(root, { recursive: true, force: true }) })
async function start() {
  const id = manager.start('/tmp', 'first', options)
  await vi.waitFor(() => expect(sdk.query).toHaveBeenCalledOnce())
  const input = sdk.query.mock.calls[0][0].prompt[Symbol.asyncIterator]()
  const first = (await input.next()).value
  const output = sdk.query.mock.results[0].value
  return { id, input, first, output }
}
const result = (uuid: string, failed = false) => ({ type: 'result', subtype: failed ? 'error_during_execution' : 'success', is_error: failed, result: 'done', errors: failed ? ['failed'] : [], user_message_uuid: uuid, duration_ms: 1, queued_turn_count: 0 })
it('queues, edits, deletes, and automatically dispatches exactly one message after completion', async () => {
  const { id, input, first, output } = await start()
  await manager.send(id, '/tmp', 'second', options)
  await manager.send(id, '/tmp', 'third', options)
  const [second, third] = (await manager.open(id, '/tmp')).queue!.items
  await manager.queueAction(id, '/tmp', { type: 'beginEdit', id: second.id })
  await manager.queueAction(id, '/tmp', { type: 'edit', id: second.id, text: 'edited second' })
  await manager.queueAction(id, '/tmp', { type: 'delete', id: third.id })
  expect((await manager.open(id, '/tmp')).messages.filter(m => m.source === 'human')).toHaveLength(1)
  output.push(result(first.uuid))
  const sent = (await input.next()).value
  expect(sent).toMatchObject({ uuid: second.id, message: { content: 'edited second' } })
  await vi.waitFor(async () => expect((await manager.open(id, '/tmp')).queue!.items[0].status).toBe('submitted'))
  output.push(result(sent.uuid))
  await vi.waitFor(async () => expect((await manager.open(id, '/tmp')).queue!.items).toEqual([]))
})
it('inserts the selected item once using current options while preserving the remaining order', async () => {
  const { id, input, output } = await start()
  for (const text of ['one', 'two', 'three']) await manager.send(id, '/tmp', text, { ...options, effort: 'high' })
  const items = (await manager.open(id, '/tmp')).queue!.items
  const attempts = await Promise.allSettled([manager.queueAction(id, '/tmp', { type: 'insert', id: items[1].id }), manager.queueAction(id, '/tmp', { type: 'insert', id: items[1].id })])
  expect(attempts.filter(a => a.status === 'fulfilled')).toHaveLength(1)
  expect((await input.next()).value).toMatchObject({ uuid: items[1].id, message: { content: 'two' } })
  expect((await manager.open(id, '/tmp')).queue!.items.filter(i => i.status === 'queued').map(i => i.text)).toEqual(['one', 'three'])
  expect((await manager.open(id, '/tmp')).queue!.items[1].options).toEqual(options)
  expect(output.interrupt).not.toHaveBeenCalled()
})
it('persists independent options and restarts with paused queue and unknown unconfirmed deliveries', async () => {
  const { id } = await start()
  await manager.setEffort(id, 'high'); await manager.setMode(id, 'plan')
  const other = manager.start('/tmp', 'other', options)
  await manager.send(id, '/tmp', 'pending', options)
  const item = (await manager.open(id, '/tmp')).queue!.items[0]
  await manager.queueAction(id, '/tmp', { type: 'insert', id: item.id })
  manager.closeAll(); manager = setup()
  expect((await manager.open(id, '/tmp')).options).toEqual({ ...options, effort: 'high', mode: 'plan' })
  expect((await manager.open(other, '/tmp')).options).toEqual(options)
  const queue = (await manager.open(id, '/tmp')).queue!
  expect(queue.paused).toBe(true); expect(queue.items[0].status).toBe('unknown')
  const calls = sdk.query.mock.calls.length
  await manager.queueAction(id, '/tmp', { type: 'resume' })
  expect(sdk.query).toHaveBeenCalledTimes(calls)
})
it('persists acknowledged fields only when SDK rejects a setting', async () => {
  const { id, output } = await start()
  output.setModel.mockRejectedValue(new Error('not available'))
  await expect(manager.setModel(id, 'missing')).rejects.toThrow('not available')
  await manager.setEffort(id, 'high')
  manager.closeAll(); manager = setup()
  expect((await manager.open(id, '/tmp')).options).toEqual({ ...options, effort: 'high' })
})
it('pauses after stop or failure and does not insert while stopping', async () => {
  const { id, first, output } = await start()
  await manager.send(id, '/tmp', 'next', options)
  const item = (await manager.open(id, '/tmp')).queue!.items[0]
  await manager.interrupt(id)
  await expect(manager.queueAction(id, '/tmp', { type: 'insert', id: item.id })).rejects.toThrow('不可插入')
  output.push(result(first.uuid, true))
  await vi.waitFor(async () => expect((await manager.open(id, '/tmp')).state).toBe('idle'))
  expect((await manager.open(id, '/tmp')).queue).toMatchObject({ paused: true, items: [{ status: 'queued' }] })
})
it('does not dispatch after permission waiting, and checks attachments again before delivery', async () => {
  const { id } = await start()
  await expect(manager.send(id, '/tmp', 'file', options, [join(root, 'missing')])).rejects.toThrow()
  expect((await manager.open(id, '/tmp')).queue!.items).toHaveLength(0)
})

it('holds an edited item in its original position and does not send it or skip ahead', async () => {
  const { id, output, first } = await start()
  await manager.send(id, '/tmp', 'original second', options)
  await manager.send(id, '/tmp', 'third', options)
  const second = (await manager.open(id, '/tmp')).queue!.items[0]
  await manager.queueAction(id, '/tmp', { type: 'beginEdit', id: second.id })
  output.push(result(first.uuid))
  await vi.waitFor(async () => expect((await manager.open(id, '/tmp')).state).toBe('idle'))
  await manager.queueAction(id, '/tmp', { type: 'resume' })
  expect((await manager.open(id, '/tmp')).queue!.items.map(i => [i.id, i.status])).toEqual([[second.id, 'queued'], [expect.any(String), 'queued']])
  await expect(manager.queueAction(id, '/tmp', { type: 'insert', id: second.id })).rejects.toThrow('保存或取消')
  await manager.queueAction(id, '/tmp', { type: 'edit', id: second.id, text: 'updated second' })
  const queue = (await manager.open(id, '/tmp')).queue!
  expect(queue.items.map(i => i.text)).toEqual(['updated second', 'third'])
  expect(queue.items[0].id).toBe(second.id)
  expect(queue.items[0].editing).toBeUndefined()
  expect(queue.paused).toBe(true)
})
it('cancelling preserves the original message, and clearing pending items cannot remove an edit', async () => {
  const { id } = await start()
  await manager.send(id, '/tmp', 'original', options)
  const item = (await manager.open(id, '/tmp')).queue!.items[0]
  await manager.queueAction(id, '/tmp', { type: 'beginEdit', id: item.id })
  await manager.queueAction(id, '/tmp', { type: 'clear' })
  expect((await manager.open(id, '/tmp')).queue!.items[0].editing).toBe(true)
  await manager.queueAction(id, '/tmp', { type: 'cancelEdit', id: item.id })
  expect((await manager.open(id, '/tmp')).queue!.items[0]).toMatchObject({ id: item.id, text: 'original' })
  expect((await manager.open(id, '/tmp')).queue!.items[0].editing).toBeUndefined()
})
it('rejects editing an already submitted item without withdrawing it', async () => {
  const { id } = await start()
  await manager.send(id, '/tmp', 'insert', options)
  const item = (await manager.open(id, '/tmp')).queue!.items[0]
  await manager.queueAction(id, '/tmp', { type: 'insert', id: item.id })
  await expect(manager.queueAction(id, '/tmp', { type: 'beginEdit', id: item.id })).rejects.toThrow('已经提交')
})

it('clears an empty queue pause so the next idle send is not trapped in an invisible queue', async () => {
  const { id, input, output, first } = await start()
  await manager.send(id, '/tmp', 'pending', options)
  await manager.queueAction(id, '/tmp', { type: 'pause' })
  await manager.queueAction(id, '/tmp', { type: 'clear' })
  expect((await manager.open(id, '/tmp')).queue).toEqual({ items: [], paused: false })
  output.push(result(first.uuid))
  await vi.waitFor(async () => expect((await manager.open(id, '/tmp')).state).toBe('idle'))
  await manager.send(id, '/tmp', 'new task', options)
  expect((await input.next()).value.message.content).toBe('new task')
  expect((await manager.open(id, '/tmp')).queue!.items).toEqual([])
})

it('persists reordered messages and dispatches the new head without changing identity or content', async () => {
  const { id, output, first, input } = await start()
  for (const text of ['one', 'two', 'three']) await manager.send(id, '/tmp', text, options)
  const [one, two, three] = (await manager.open(id, '/tmp')).queue!.items
  await manager.queueAction(id, '/tmp', { type: 'move', id: three.id, targetId: one.id, position: 'before' })
  expect((await manager.open(id, '/tmp')).queue!.items.map(i => i.id)).toEqual([three.id, one.id, two.id])
  expect(createSessionPreferencesRepository(() => root).load(id)!.queue.items.map(i => i.text)).toEqual(['three', 'one', 'two'])
  output.push(result(first.uuid))
  expect((await input.next()).value).toMatchObject({ uuid: three.id, message: { content: 'three' } })
  await expect(manager.queueAction(id, '/tmp', { type: 'move', id: three.id, targetId: one.id, position: 'after' })).rejects.toThrow('已经提交')
})
it('keeps editing entries fixed and rejects stale reorder targets', async () => {
  const { id } = await start()
  for (const text of ['one', 'editing', 'three']) await manager.send(id, '/tmp', text, options)
  const [one, editing, three] = (await manager.open(id, '/tmp')).queue!.items
  await manager.queueAction(id, '/tmp', { type: 'beginEdit', id: editing.id })
  await manager.queueAction(id, '/tmp', { type: 'move', id: three.id, targetId: one.id, position: 'before' })
  expect((await manager.open(id, '/tmp')).queue!.items.map(i => i.id)).toEqual([three.id, editing.id, one.id])
  await expect(manager.queueAction(id, '/tmp', { type: 'move', id: one.id, targetId: editing.id, position: 'before' })).rejects.toThrow('正在编辑')
  await manager.queueAction(id, '/tmp', { type: 'delete', id: three.id })
  await expect(manager.queueAction(id, '/tmp', { type: 'move', id: one.id, targetId: three.id, position: 'before' })).rejects.toThrow('重新调整')
})

it('finishes a received queue item using earlier assistant correlation when the result omits IDs', async () => {
  const { id, first, output, input } = await start()
  await manager.send(id, '/tmp', 'second', options)
  output.push(result(first.uuid))
  const second = (await input.next()).value
  output.push({ type: 'assistant', user_message_uuid: second.uuid, message: { id: 'reply', content: [{ type: 'text', text: 'done' }] }, parent_tool_use_id: null })
  output.push({ type: 'result', subtype: 'success', is_error: false, result: 'done', duration_ms: 1, queued_turn_count: 0 })
  await vi.waitFor(async () => {
    const snap = await manager.open(id, '/tmp')
    expect(snap.state).toBe('idle'); expect(snap.queue).toEqual({ items: [], paused: false })
  })
  await manager.send(id, '/tmp', 'fresh message', options)
  expect((await input.next()).value.message.content).toBe('fresh message')
  expect((await manager.open(id, '/tmp')).queue!.items).toEqual([])
})
it('lets a fresh manual input through an idle session even when an old delivery is uncertain', async () => {
  const { id, first, output, input } = await start()
  await manager.send(id, '/tmp', 'second', options)
  output.push(result(first.uuid))
  const second = (await input.next()).value
  output.push({ type: 'result', subtype: 'success', is_error: false, result: 'done', duration_ms: 1, queued_turn_count: 0 })
  await vi.waitFor(async () => expect((await manager.open(id, '/tmp')).state).toBe('idle'))
  expect((await manager.open(id, '/tmp')).queue!.items[0]).toMatchObject({ id: second.uuid, status: 'unknown' })
  await manager.send(id, '/tmp', 'new independent message', options)
  const fresh = (await input.next()).value
  expect(fresh.message.content).toBe('new independent message')
  const remaining = (await manager.open(id, '/tmp')).queue!.items
  expect(remaining).toHaveLength(1)
  expect(remaining[0]).toMatchObject({ id: second.uuid, status: 'unknown' })
  await manager.send(id, '/tmp', 'follow-up', options)
  output.push(result(fresh.uuid))
  expect((await input.next()).value.message.content).toBe('follow-up')
})
it('does not mistake child-agent correlation for consumed main-session queue inputs', async () => {
  const { id, first, output, input } = await start()
  await manager.send(id, '/tmp', 'second', options)
  output.push(result(first.uuid))
  const second = (await input.next()).value
  output.push({ type: 'assistant', parent_tool_use_id: 'child', user_message_uuid: second.uuid, message: { id: 'child', content: [{ type: 'text', text: 'child output' }] } })
  output.push({ type: 'result', subtype: 'success', is_error: false, result: 'done', duration_ms: 1, queued_turn_count: 0 })
  await vi.waitFor(async () => expect((await manager.open(id, '/tmp')).queue!.items[0].status).toBe('unknown'))
})
