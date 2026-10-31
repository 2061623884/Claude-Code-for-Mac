import { afterEach, expect, it, vi } from 'vitest'
import type { Query } from '@anthropic-ai/claude-agent-sdk'
import { temporaryQuery, closeTemporaryQueries } from '../src/main/temporaryQuery'
const makeQuery = () => ({ close: vi.fn(), [Symbol.asyncIterator]: vi.fn(() => { throw new Error('must not drain') }) })
afterEach(() => { closeTemporaryQueries(); vi.useRealTimers() })
it('returns a result without draining the SDK stream and closes exactly once', async () => {
  const query = makeQuery()
  let controller!: AbortController
  await expect(temporaryQuery(async (abort) => { controller = abort; return query as unknown as Query }, async () => 42)).resolves.toBe(42)
  expect(query.close).toHaveBeenCalledOnce()
  expect(query[Symbol.asyncIterator]).not.toHaveBeenCalled()
  expect(controller.signal.aborted).toBe(true)
})
it('times out and closes a query whose operation never resolves', async () => {
  vi.useFakeTimers()
  const query = makeQuery()
  const task = temporaryQuery(async () => query as unknown as Query, () => new Promise(() => {}))
  const checked = expect(task).rejects.toThrow('超时')
  await vi.advanceTimersByTimeAsync(15_000)
  await checked
  expect(query.close).toHaveBeenCalledOnce()
})
it('shutdown cancels all query owners and leaves no active queries behind', async () => {
  const queries = [makeQuery(), makeQuery()]
  const tasks = queries.map(q => temporaryQuery(async () => q as unknown as Query, () => new Promise(() => {})))
  const checked = tasks.map(task => expect(task).rejects.toThrow('取消'))
  await new Promise(resolve => setTimeout(resolve, 0))
  closeTemporaryQueries()
  await Promise.all(checked)
  closeTemporaryQueries()
  for (const query of queries) expect(query.close).toHaveBeenCalledOnce()
})
it('closes a query returned by a factory after cancellation', async () => {
  const query = makeQuery(), controller = new AbortController()
  let finish!: (value: Query) => void
  const task = temporaryQuery(() => new Promise(resolve => { finish = resolve }), async () => 1, controller.signal)
  const checked = expect(task).rejects.toThrow('取消')
  await Promise.resolve()
  controller.abort()
  await checked
  finish(query as unknown as Query)
  await vi.waitFor(() => expect(query.close).toHaveBeenCalledOnce())
})
it('closes the query when the operation fails', async () => {
  const query = makeQuery()
  await expect(temporaryQuery(async () => query as unknown as Query, async () => { throw new Error('read failed') })).rejects.toThrow('read failed')
  expect(query.close).toHaveBeenCalledOnce()
})
