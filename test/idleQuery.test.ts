import { afterEach, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ query: vi.fn(), close: vi.fn() }))
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: fake.query }))
vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../src/main/store', () => ({ read: () => ({ settings: { claudePath: null } }) }))
import { withIdleQuery, closeIdleQueries, loadSdk } from '../src/main/sdk'
afterEach(() => { closeIdleQueries(); vi.useRealTimers(); vi.clearAllMocks() })
it('returns control metadata without draining a never-ending stream and closes the process', async () => {
  fake.query.mockReturnValue({ close: fake.close, [Symbol.asyncIterator]: () => { throw Error('must not drain') } })
  await expect(withIdleQuery({ cwd: '/tmp' }, async () => 'metadata')).resolves.toBe('metadata')
  expect(fake.close).toHaveBeenCalledOnce()
  expect(fake.query.mock.calls[0][0].options.persistSession).toBe(false)
})
it('bounds a stalled query and aborts its process', async () => {
  await loadSdk(); vi.useFakeTimers()
  fake.query.mockReturnValue({ close: fake.close })
  const waiting = withIdleQuery({ cwd: '/tmp' }, () => new Promise(() => {}))
  const assertion = expect(waiting).rejects.toThrow('超时')
  await vi.advanceTimersByTimeAsync(15001); await assertion
  expect(fake.close).toHaveBeenCalledOnce()
})
it('cleans up a pending metadata query on application shutdown', async () => {
  fake.query.mockReturnValue({ close: fake.close })
  const waiting = withIdleQuery({ cwd: '/tmp' }, () => new Promise(() => {}))
  const assertion = expect(waiting).rejects.toThrow('取消')
  await vi.waitFor(() => expect(fake.query).toHaveBeenCalledOnce())
  closeIdleQueries(); await assertion; expect(fake.close).toHaveBeenCalledOnce()
})
