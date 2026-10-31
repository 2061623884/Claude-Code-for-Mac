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
  const stream = new PushQueue<never>()
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
