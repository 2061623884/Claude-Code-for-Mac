import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SessionManager } from '../src/main/live/SessionManager'
import { PushQueue } from '../src/main/live/PushQueue'
import type { ChatEvent } from '../src/shared/chat'

const sdk = vi.hoisted(() => ({ query: vi.fn(), getSessionMessages: vi.fn() }))
vi.mock('../src/main/sdk', () => ({ loadSdk: async () => sdk, claudeExecutable: () => undefined }))
vi.mock('../src/main/store', () => ({ read: () => ({ settings: { allowBypass: false } }) }))
const options = { model: null, mode: 'default' as const, effort: null }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
let manager: SessionManager
const emit = vi.fn<(id: string, event: ChatEvent) => void>()
const save = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  save.mockReset()
  sdk.getSessionMessages.mockResolvedValue([])
  sdk.query.mockImplementation(() => {
    const stream = new PushQueue<unknown>()
    return Object.assign(stream, {
      close: vi.fn(() => stream.end()), interrupt: vi.fn().mockResolvedValue(undefined),
      setModel: vi.fn().mockResolvedValue(undefined), setPermissionMode: vi.fn().mockResolvedValue(undefined),
      applyFlagSettings: vi.fn().mockResolvedValue(undefined), askSideQuestion: vi.fn().mockResolvedValue({ response: 'answer' })
    })
  })
  manager = new SessionManager(emit, undefined, undefined, undefined, { load: () => undefined, save })
})
afterEach(() => manager.closeAll())
async function start() {
  const id = manager.start('/tmp', 'first', options)
  await vi.waitFor(() => expect(sdk.query).toHaveBeenCalledOnce())
  const output = sdk.query.mock.results[0].value
  const input = sdk.query.mock.calls[0][0].prompt[Symbol.asyncIterator]()
  const first = (await input.next()).value
  return { id, output, input, first }
}

it('shares one runtime between concurrent side questions and main sends', async () => {
  const history = deferred<unknown[]>()
  sdk.getSessionMessages.mockReturnValue(history.promise)
  const side = manager.sideQuestion('existing', '/tmp', 'question', [], options)
  const send = manager.send('existing', '/tmp', 'task', options)
  await vi.waitFor(() => expect(sdk.getSessionMessages).toHaveBeenCalledOnce())
  history.resolve([])
  await Promise.all([side, send])
  expect(sdk.query).toHaveBeenCalledOnce()
  expect((await manager.open('existing', '/tmp')).messages).toHaveLength(1)
  manager.closeAll()
  expect(sdk.query.mock.results[0].value.close).toHaveBeenCalledOnce()
})

it.each(['interrupt', 'pause'] as const)('%s cancels dispatch awaiting SDK options without losing the queued message', async action => {
  const { id, output, first, input } = await start()
  const changing = deferred<void>()
  output.setModel.mockReturnValue(changing.promise)
  await manager.send(id, '/tmp', 'second', { ...options, model: 'other' })
  output.push({ type: 'result', subtype: 'success', is_error: false, result: 'done', user_message_uuid: first.uuid, duration_ms: 1, queued_turn_count: 0 })
  await vi.waitFor(() => expect(output.setModel).toHaveBeenCalledOnce())
  if (action === 'interrupt') await manager.interrupt(id)
  else await manager.queueAction(id, '/tmp', { type: 'pause' })
  changing.resolve()
  // 同一会话后续命令完成，说明此前的派发已经退出。
  await manager.setEffort(id, null)
  const snapshot = await manager.open(id, '/tmp')
  expect(snapshot.queue).toMatchObject({ paused: true, items: [{ text: 'second', status: 'queued' }] })
  expect(snapshot.messages).toHaveLength(1)
  await manager.queueAction(id, '/tmp', { type: 'resume' })
  expect((await input.next()).value.message.content).toBe('second')
})

it('keeps SDK-confirmed permissions visible after a save failure and can explicitly restore the old mode', async () => {
  const { id, output } = await start()
  let actualMode = 'default'
  output.setPermissionMode.mockImplementation(async (mode: string) => { actualMode = mode })
  save.mockImplementationOnce(() => { throw new Error('disk full') })
  await expect(manager.setMode(id, 'acceptEdits')).rejects.toThrow('已生效，但保存失败')
  const snapshot = await manager.open(id, '/tmp')
  expect(snapshot.options!.mode).toBe(actualMode)
  expect(snapshot.optionsSaved).toBe(false)
  expect(snapshot.optionsSaveError).toContain('disk full')
  expect(emit).toHaveBeenCalledWith(id, expect.objectContaining({ kind: 'options', options: { ...options, mode: 'acceptEdits' }, optionsSaved: false }))
  await manager.setMode(id, 'default')
  expect(actualMode).toBe('default')
  expect(output.setPermissionMode).toHaveBeenCalledTimes(2)
  expect(await manager.open(id, '/tmp')).toMatchObject({ optionsSaved: true, optionsSaveError: null })
})

it('does not let an earlier queued resume undo a newer pause', async () => {
  const { id, output } = await start()
  await manager.send(id, '/tmp', 'second', options)
  const changing = deferred<void>()
  output.setModel.mockReturnValue(changing.promise)
  const setting = manager.setModel(id, 'other')
  await vi.waitFor(() => expect(output.setModel).toHaveBeenCalledOnce())
  const resume = manager.queueAction(id, '/tmp', { type: 'resume' })
  await manager.queueAction(id, '/tmp', { type: 'pause' })
  changing.resolve()
  await Promise.all([setting, resume])
  expect((await manager.open(id, '/tmp')).queue).toMatchObject({ paused: true, items: [{ status: 'queued' }] })
})

it('retries persistence without repeating an already confirmed SDK change', async () => {
  const { id, output } = await start()
  save.mockImplementationOnce(() => { throw new Error('disk full') })
  await expect(manager.setMode(id, 'acceptEdits')).rejects.toThrow('disk full')
  await manager.setMode(id, 'acceptEdits')
  expect(output.setPermissionMode).toHaveBeenCalledOnce()
  expect(await manager.open(id, '/tmp')).toMatchObject({ optionsSaved: true, optionsSaveError: null })
})

it('still interrupts and closes every runtime when persistence keeps failing', async () => {
  const { id, output } = await start()
  manager.start('/tmp', 'other', options)
  await vi.waitFor(() => expect(sdk.query).toHaveBeenCalledTimes(2))
  save.mockImplementation(() => { throw new Error('disk full') })
  await manager.interrupt(id)
  expect(output.interrupt).toHaveBeenCalledOnce()
  expect(() => manager.closeAll()).not.toThrow()
  for (const result of sdk.query.mock.results) expect(result.value.close).toHaveBeenCalledOnce()
})

it('does not resurrect a runtime after shutdown while loading history', async () => {
  const history = deferred<unknown[]>()
  sdk.getSessionMessages.mockReturnValue(history.promise)
  const pending = manager.sideQuestion('existing', '/tmp', 'question', [], options)
  const rejection = expect(pending).rejects.toThrow('取消')
  await vi.waitFor(() => expect(sdk.getSessionMessages).toHaveBeenCalledOnce())
  manager.closeAll()
  history.resolve([])
  await rejection
  expect(sdk.query).not.toHaveBeenCalled()
})

it('invalidates pending restoration when reloading the same session', async () => {
  const history = deferred<unknown[]>()
  sdk.getSessionMessages.mockReturnValueOnce(history.promise)
  const pending = manager.sideQuestion('existing', '/tmp', 'question', [], options)
  const rejection = expect(pending).rejects.toThrow('取消')
  await vi.waitFor(() => expect(sdk.getSessionMessages).toHaveBeenCalledOnce())
  await manager.reload('existing', '/tmp')
  await manager.send('existing', '/tmp', 'new request', options)
  history.resolve([])
  await rejection
  expect(sdk.query).toHaveBeenCalledOnce()
  expect((await manager.open('existing', '/tmp')).messages).toHaveLength(1)
})

it('uses one monotonically increasing version for events and snapshots', async () => {
  const { id } = await start()
  const before = await manager.open(id, '/tmp')
  await manager.setMode(id, 'plan')
  const after = await manager.open(id, '/tmp')
  const revisions = emit.mock.calls.filter(([sessionId]) => sessionId === id).map(([, event]) => event.revision!)
  expect(revisions.every((value, index) => index === 0 || value > revisions[index - 1])).toBe(true)
  expect(after.revision).toBe(revisions.at(-1))
  expect(after.revision).toBeGreaterThan(before.revision!)
})
