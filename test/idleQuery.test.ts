import { afterEach, expect, it, vi } from 'vitest'
import { withIdleQuery } from '../src/main/sdk'
import { readMetadata } from '../src/main/metadataQuery'
import { closeTemporaryQueries } from '../src/main/temporaryQuery'
vi.mock('../src/main/systemProxy', async importOriginal => ({ ...await importOriginal<typeof import('../src/main/systemProxy')>(), readSystemProxy: async () => ({ HTTPS_PROXY: 'http://system:7897' }) }))
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

it('passes system proxy to the query without overriding a caller proxy', async () => {
  sdk.query.mockReturnValue({ close: vi.fn() })
  await withIdleQuery({ env: { HTTPS_PROXY: 'http://custom:8000' } }, async () => true)
  expect(sdk.query.mock.calls[0][0].options.env.HTTPS_PROXY).toBe('http://custom:8000')
  await withIdleQuery({}, async () => true)
  expect(sdk.query.mock.calls[1][0].options.env.HTTPS_PROXY).toBe('http://system:7897')
})
