import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SessionManager } from '../src/main/live/SessionManager'
import { LiveSession } from '../src/main/live/LiveSession'
import { Transcript } from '../src/main/transcript'
import { PushQueue } from '../src/main/live/PushQueue'

const sdk = vi.hoisted(() => ({ query: vi.fn(), getSessionMessages: vi.fn(), load: vi.fn() }))
vi.mock('../src/main/sdk', () => ({ loadSdk: () => sdk.load(), claudeExecutable: () => undefined, withIdleQuery: vi.fn() }))
vi.mock('../src/main/store', () => ({ read: () => ({ settings: { allowBypass: false } }) }))
const options = { model: null, mode: 'default' as const, effort: null }
let manager: SessionManager
const emit = vi.fn()
function liveQuery() {
  const stream = new PushQueue<unknown>()
  return Object.assign(stream, { close: vi.fn(() => stream.end()), interrupt: vi.fn().mockResolvedValue(undefined) })
}
beforeEach(() => {
  vi.clearAllMocks()
  sdk.load.mockImplementation(async () => sdk)
  sdk.getSessionMessages.mockResolvedValue([])
  sdk.query.mockImplementation(liveQuery)
  manager = new SessionManager(emit)
})
afterEach(() => manager.closeAll())
it('recreates the SDK query after a stream error and consumes the retry', async () => {
  sdk.query.mockImplementationOnce(() => ({ close: vi.fn(), async *[Symbol.asyncIterator]() { throw new Error('process exited') } }))
  const id = manager.start('/tmp', 'first', options)
  await vi.waitFor(() => expect(emit).toHaveBeenCalledWith(id, { kind: 'state', state: 'error' }))
  expect((await manager.open(id, '/tmp')).live).toBe(false)
  await manager.send(id, '/tmp', 'retry', options)
  await vi.waitFor(() => expect(sdk.query).toHaveBeenCalledTimes(2))
  const init = sdk.query.mock.calls[1][0]
  expect(init.options.resume).toBe(id)
  const item = await init.prompt[Symbol.asyncIterator]().next()
  expect(item.value.message.content).toBe('retry')
  expect((await manager.open(id, '/tmp')).live).toBe(true)
})
it('removes a stream that exits without a result instead of leaving running state', async () => {
  sdk.query.mockImplementationOnce(() => ({ close: vi.fn(), async *[Symbol.asyncIterator]() {} }))
  const id = manager.start('/tmp', 'first', options)
  await vi.waitFor(() => expect(emit).toHaveBeenCalledWith(id, { kind: 'state', state: 'error' }))
  expect((await manager.open(id, '/tmp')).live).toBe(false)
})
it('settles waiting side questions when the SDK query constructor throws', async () => {
  sdk.query.mockImplementationOnce(() => { throw new Error('invalid executable') })
  await expect(manager.sideQuestion('existing', '/tmp', 'question', [], options)).rejects.toThrow('invalid executable')
  expect((await manager.open('existing', '/tmp')).live).toBe(false)
})
it('cancels a session closed before SDK loading completes', async () => {
  let resolve!: (value: typeof sdk) => void
  sdk.load.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
  const onClosed = vi.fn()
  const session = new LiveSession({ sessionId: 'delayed', cwd: '/tmp', resume: false, options, transcript: new Transcript(), emit, onClosed })
  const start = session.start()
  const pending = session.mcpStatus()
  session.close()
  await expect(pending).rejects.toThrow('会话已关闭')
  resolve(sdk)
  await start
  session.close()
  expect(sdk.query).not.toHaveBeenCalled()
  expect(onClosed).toHaveBeenCalledTimes(1)
})
it('shares one replacement instance between concurrent retries', async () => {
  await Promise.all([manager.send('existing', '/tmp', 'one', options), manager.send('existing', '/tmp', 'two', options)])
  await vi.waitFor(() => expect(sdk.query).toHaveBeenCalledTimes(1))
  expect((await manager.open('existing', '/tmp')).messages).toHaveLength(2)
})
it('late termination of an old query does not delete its replacement', async () => {
  let finish!: () => void
  const wait = new Promise<void>((resolve) => { finish = resolve })
  sdk.query.mockImplementationOnce(() => ({ close: vi.fn(), async *[Symbol.asyncIterator]() { await wait } }))
  const id = manager.start('/tmp', 'first', options)
  await vi.waitFor(() => expect(sdk.query).toHaveBeenCalledTimes(1))
  await manager.reload(id, '/tmp')
  await manager.send(id, '/tmp', 'retry', options)
  finish()
  await vi.waitFor(() => expect(sdk.query).toHaveBeenCalledTimes(2))
  expect((await manager.open(id, '/tmp')).live).toBe(true)
})

it('includes historical activity in snapshots and marks incomplete history', async () => {
  sdk.getSessionMessages.mockResolvedValue([
    { type: 'assistant', message: { id: 'history', content: [{ type: 'tool_use', id: 'read', name: 'Read', input: { file_path: '/tmp/source.md' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'read', content: 'text' }] } }
  ])
  const snapshot = await manager.open('history', '/tmp')
  expect(snapshot.summary?.sections.sources).toEqual([expect.objectContaining({ path: '/tmp/source.md', description: '调用 1 次 · 成功 1' })])
  expect(snapshot.summary?.historyIncomplete).toBe(true)
})
it('emits and persists live summary changes, including SDK directory hooks', async () => {
  manager.closeAll()
  const save = vi.fn()
  manager = new SessionManager(emit, { load: () => undefined, save })
  const id = manager.start('/tmp', 'Read sources', options)
  await vi.waitFor(() => expect(sdk.query).toHaveBeenCalledTimes(1))
  const query = sdk.query.mock.results[0].value
  query.push({ type: 'assistant', message: { id: 'live', content: [{ type: 'tool_use', id: 'read', name: 'Read', input: { file_path: '/tmp/live.md' } }] } })
  query.push({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'read', content: 'text' }] } })
  const hooks = sdk.query.mock.calls[0][0].options.hooks
  await hooks.DirectoryAdded[0].hooks[0]({ hook_event_name: 'DirectoryAdded', directory: '/other' })
  await hooks.CwdChanged[0].hooks[0]({ hook_event_name: 'CwdChanged', new_cwd: '/other/subdir' })
  await vi.waitFor(() => expect(emit).toHaveBeenCalledWith(id, expect.objectContaining({ kind: 'summary', summary: expect.objectContaining({ sections: expect.objectContaining({ sources: [expect.objectContaining({ path: '/tmp/live.md' })] }) }) })))
  expect(save).toHaveBeenCalledWith(id, expect.objectContaining({ version: 1, tools: [expect.objectContaining({ id: 'read' })] }))
  expect((await manager.open(id, '/tmp')).summary?.sections.projects.map((p) => p.path)).toEqual(['/tmp', '/other', '/other/subdir'])
})
