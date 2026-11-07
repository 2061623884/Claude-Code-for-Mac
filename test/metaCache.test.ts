import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mocks = vi.hoisted(() => ({ directory: '', load: vi.fn(), executable: undefined as string | undefined }))
vi.mock('electron', () => ({ app: { getVersion: () => '1', getPath: () => mocks.directory } }))
vi.mock('../src/main/metadataQuery', () => ({ readMetadata: mocks.load }))
vi.mock('../src/main/sdk', () => ({ claudeExecutable: () => mocks.executable }))
import * as meta from '../src/main/meta'

beforeEach(() => {
  mocks.directory = mkdtempSync(join(tmpdir(), 'meta-cache-'))
  mocks.load.mockReset()
  mocks.executable = undefined
  meta.invalidate()
})
afterEach(() => { vi.useRealTimers(); meta.invalidate(); rmSync(mocks.directory, { recursive: true, force: true }) })

it('persists validated models by project without account information and deduplicates concurrent loads', async () => {
  mocks.load.mockResolvedValue({ models: [{ value: 'opus', displayName: 'Opus', supportsEffort: true, supportedEffortLevels: ['high'] }], account: { email: 'private@example.com' } })
  expect(await meta.cachedModels('/one')).toBeNull()
  const [first, second] = await Promise.all([meta.get('/one'), meta.get('/one')])
  expect(first).toEqual(second)
  expect(mocks.load).toHaveBeenCalledTimes(1)
  expect(await meta.cachedModels('/one')).toEqual([{ value: 'opus', label: 'Opus', efforts: ['high'] }])
  expect(await meta.cachedModels('/two')).toBeNull()
  meta.invalidate()
  expect(await meta.cachedModels('/one')).toEqual(first.models)
})

it('allows retry after a failed authoritative load', async () => {
  mocks.load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ models: [], account: null })
  await expect(meta.get('/one')).rejects.toThrow('offline')
  await expect(meta.get('/one')).resolves.toMatchObject({ models: [] })
  expect(mocks.load).toHaveBeenCalledTimes(2)
})

const init = (name = 'Opus') => ({ models: [{ value: 'opus', displayName: name, supportsEffort: true, supportedEffortLevels: ['high'] }], account: { email: 'private@example.com' }, commands: [] })
const cacheFile = () => join(mocks.directory, 'model-catalog', readdirSync(join(mocks.directory, 'model-catalog'))[0])

it('stores no account data and uses private file permissions', async () => {
  mocks.load.mockResolvedValue(init())
  await meta.get('/one')
  expect(readFileSync(cacheFile(), 'utf8')).not.toContain('private@example.com')
  // Windows uses ACLs, not POSIX mode bits; the no-account-data assertion above applies everywhere.
  if (process.platform !== 'win32') expect(statSync(cacheFile()).mode & 0o777).toBe(0o600)
})
it('expires memory and disk entries and ignores corrupt files', async () => {
  vi.useFakeTimers()
  mocks.load.mockResolvedValue(init())
  await meta.get('/one')
  vi.advanceTimersByTime(300001)
  await meta.get('/one')
  expect(mocks.load).toHaveBeenCalledTimes(2)
  vi.advanceTimersByTime(7 * 24 * 60 * 60_000)
  expect(await meta.cachedModels('/one')).toBeNull()
  writeFileSync(cacheFile(), '{bad')
  expect(await meta.cachedModels('/one')).toBeNull()
})
it('isolates executable changes and ignores late invalidated requests', async () => {
  let complete!: (value: ReturnType<typeof init>) => void
  mocks.load.mockImplementationOnce(() => new Promise(resolve => { complete = resolve })).mockResolvedValue(init('New'))
  const old = meta.get('/one')
  await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
  meta.invalidate()
  await meta.get('/one')
  complete(init('Old'))
  await old
  expect((await meta.cachedModels('/one'))?.[0].label).toBe('New')
  mocks.executable = '/different-cli'
  expect(await meta.cachedModels('/one')).toBeNull()
})
it('clears stale disk data on empty authoritative response and retries immediately', async () => {
  mocks.load.mockResolvedValueOnce(init()).mockResolvedValueOnce({ ...init(), models: [] }).mockResolvedValueOnce(init('Recovered'))
  await meta.get('/one')
  meta.invalidate()
  await meta.get('/one')
  expect(await meta.cachedModels('/one')).toBeNull()
  expect((await meta.get('/one')).models[0].label).toBe('Recovered')
})
it('does not fail a model load when command publication throws', async () => {
  mocks.load.mockResolvedValue(init())
  await expect(meta.get('/one', () => { throw new Error('publication') })).resolves.toMatchObject({ models: [{ value: 'opus' }] })
})
it('drops a late request when executable changes and reloads after switching back', async () => {
  let complete!: (value: ReturnType<typeof init>) => void
  const seed = vi.fn()
  mocks.load.mockImplementationOnce(() => new Promise(resolve => { complete = resolve })).mockResolvedValue(init('Fresh'))
  const old = meta.get('/one', seed)
  await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
  mocks.executable = '/changed-cli'
  complete(init('Stale'))
  await old
  expect(seed).not.toHaveBeenCalled()
  mocks.executable = undefined
  expect((await meta.get('/one')).models[0].label).toBe('Fresh')
  expect(mocks.load).toHaveBeenCalledTimes(2)
})
