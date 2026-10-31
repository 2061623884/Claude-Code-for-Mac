import { afterEach, expect, it, vi } from 'vitest'
import { withIdleQuery } from '../src/main/sdk'
import { readMetadata } from '../src/main/metadataQuery'
import { closeTemporaryQueries } from '../src/main/temporaryQuery'
const sdk = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('@anthropic-ai/claude-agent-sdk', () => sdk)
vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../src/main/store', () => ({ read: () => ({ settings: {} }) }))
afterEach(() => { closeTemporaryQueries(); vi.clearAllMocks() })
it('does not drain an idle query after obtaining the result', async () => {
  const close = vi.fn(), iterator = vi.fn()
  sdk.query.mockReturnValue({ close, [Symbol.asyncIterator]: iterator })
  await expect(withIdleQuery({}, async () => 'ready')).resolves.toBe('ready')
  expect(close).toHaveBeenCalledOnce()
  expect(iterator).not.toHaveBeenCalled()
})
it('shares shutdown cleanup between idle and metadata queries', async () => {
  const close = vi.fn()
  sdk.query.mockImplementation(() => ({ close, initializationResult: () => new Promise(() => {}) }))
  const idle = withIdleQuery({}, () => new Promise(() => {}))
  const meta = readMetadata('/tmp')
  const checked = [expect(idle).rejects.toThrow('取消'), expect(meta).rejects.toThrow('取消')]
  await vi.waitFor(() => expect(sdk.query).toHaveBeenCalledTimes(2))
  closeTemporaryQueries()
  await Promise.all(checked)
  expect(close).toHaveBeenCalledTimes(2)
})
