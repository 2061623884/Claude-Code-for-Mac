import { mkdtemp, mkdir, writeFile, readFile, rm, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { aggregateUsage, extractUsage, UsageIndexer } from '../src/main/usageAnalytics'
import { chartDays, chartWeeks, dateKey, shiftDay, streaks, remaining, formatUsageTokens, type DailyUsage } from '../src/shared/usageAnalytics'
import { usageAccount, UsageProfiles } from '../src/main/usageProfile'

const paths: string[] = []
afterEach(async () => { await Promise.all(paths.splice(0).map(p => rm(p, { recursive: true, force: true }))) })
const entry = (id: string, timestamp = '2026-10-30T12:00:00', output = 5) => ({ type: 'assistant', uuid: `outer-${id}`, timestamp, message: { id, content: [{ text: 'PRIVATE CONTENT MUST NOT BE SAVED' }], usage: { input_tokens: 10, output_tokens: output, cache_read_input_tokens: 20, cache_creation_input_tokens: 30 } } })
const day = (date: string, total: number): DailyUsage => ({ date, total, input: total, output: 0, cacheRead: 0, cacheWrite: 0 })
async function fixture() { const root = await mkdtemp(join(tmpdir(), 'usage-test-')); paths.push(root); await mkdir(join(root, 'projects', 'project', 'subagents'), { recursive: true }); return { root, path: join(root, 'projects', 'project', 'main.jsonl'), cache: join(root, 'index.json') } }

describe('usage adapter and index', () => {
  it('deduplicates response snapshots across blocks, forks and subagents; never adds session totals', () => {
    const records = [entry('one'), entry('one', undefined, 9), { ...entry('one'), uuid: 'fork-copy' }, entry('two')].map(e => extractUsage(e).record!)
    const result = aggregateUsage([{ size: 0, mtime: 0, records, longestTaskMs: 5000, issues: 0 }], new Date('2026-11-01T12:00:00'))
    expect(result.total).toBe(134)
    expect(result.days).toHaveLength(1)
    expect(result.peak).toBe(134)
    expect(result.longestTaskMs).toBe(5000)
    expect(extractUsage({ type: 'result', modelUsage: { inputTokens: 90000 } })).toEqual({})
  })
  it('falls back to UUID and rejects missing identities, invalid timestamps and negative usage', () => {
    const e = entry('one'); delete (e.message as any).id
    expect(extractUsage(e).record?.id).toBe('uuid:outer-one')
    expect(extractUsage({ ...e, uuid: undefined }).invalid).toBe(true)
    expect(extractUsage({ ...e, timestamp: 'bad' }).invalid).toBe(true)
    expect(extractUsage(entry('negative', undefined, -2)).invalid).toBe(true)
  })
  it('indexes all local files incrementally, handles partial writes and deletion, and persists no text', async () => {
    const f = await fixture()
    await writeFile(f.path, JSON.stringify(entry('one')) + '\n{broken')
    const sub = join(f.root, 'projects/project/subagents/agent.jsonl')
    await writeFile(sub, JSON.stringify(entry('two')) + '\n')
    const index = new UsageIndexer(f.root, f.cache)
    expect(await index.refresh()).toMatchObject({ total: 130, issues: 1 })
    const cache = await readFile(f.cache, 'utf8')
    expect(cache).not.toContain('PRIVATE CONTENT')
    expect(await new UsageIndexer(f.root, f.cache).refresh()).toMatchObject({ total: 130, issues: 1 })
    await writeFile(f.path, JSON.stringify(entry('one', undefined, 8)) + '\n')
    expect(await index.refresh()).toMatchObject({ total: 133, issues: 0 })
    await rm(sub)
    expect((await index.refresh()).total).toBe(68)
    await appendFile(f.path, JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs: 12345 }) + '\n')
    expect((await index.refresh()).longestTaskMs).toBe(12345)
    await index.recordDuration(20000)
    expect((await new UsageIndexer(f.root, f.cache).refresh()).longestTaskMs).toBe(20000)
  })
  it('rebuilds a corrupt cache, reports empty history without inventing duration', async () => {
    const f = await fixture(); await writeFile(f.cache, 'bad json')
    expect(await new UsageIndexer(f.root, f.cache).refresh()).toMatchObject({ total: 0, longestTaskMs: null, firstDate: null })
  })
})
describe('calendar and charts', () => {
  it('computes year boundaries, yesterday grace and longest streak', () => {
    const days = ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-03'].map(d => day(d, 10))
    expect(streaks(days, '2026-01-02')).toEqual({ longestStreak: 3, currentStreak: 3 })
    expect(streaks(days, '2026-01-05')).toEqual({ longestStreak: 3, currentStreak: 0 })
    expect(shiftDay('2024-02-28', 1)).toBe('2024-02-29')
    expect(shiftDay('2026-03-08', 1)).toBe('2026-03-09')
    expect(dateKey(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01')
    const previousTZ = process.env.TZ
    try {
      process.env.TZ = 'Asia/Taipei'; expect(dateKey(new Date('2026-01-01T17:00:00Z'))).toBe('2026-01-02')
      process.env.TZ = 'America/New_York'; expect(dateKey(new Date('2026-01-01T17:00:00Z'))).toBe('2026-01-01')
      expect(shiftDay('2026-03-08', 1)).toBe('2026-03-09')
    } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ }
  })
  it('keeps pre-range cumulative baseline and marks partial boundary weeks', () => {
    const days = [day('2025-12-30', 50), day('2026-01-01', 10), day('2026-01-05', 20)]
    const points = chartDays(days, '2026-01-01', '2026-01-07')
    expect(points[0].cumulative).toBe(60); expect(points.at(-1)?.cumulative).toBe(80)
    expect(chartWeeks(points)).toEqual([{ start: '2026-01-01', end: '2026-01-04', total: 10, partial: true }, { start: '2026-01-05', end: '2026-01-07', total: 20, partial: true }])
    expect(chartWeeks(chartDays(days, '2026-01-05', '2026-01-11'))[0].partial).toBe(false)
    expect(chartWeeks(points).reduce((sum, w) => sum + w.total, 0)).toBe(points.reduce((sum, d) => sum + d.total, 0))
  })
  it('formats large totals without an oversized label', () => { expect(formatUsageTokens(19150000000)).toBe('191.5 亿') })
  it('clamps remaining quota to valid percentages', () => { expect([20, 101, -2].map(remaining)).toEqual([80, 0, 100]) })
})
describe('local profiles', () => {
  it('persists across restart and isolates account identities', async () => {
    const f = await fixture(), a = usageAccount({ email: 'a@example.com' }), b = usageAccount({ email: 'b@example.com' })
    const repo = new UsageProfiles(join(f.root, 'profiles'))
    expect((await repo.get(a)).name).toBe('a')
    await repo.save(a.key, { name: 'Display name', avatar: 'data:image/png;base64,AAAA' })
    expect((await new UsageProfiles(join(f.root, 'profiles')).get(a)).name).toBe('Display name')
    expect((await repo.get(b)).name).toBe('b')
    await expect(repo.save('../bad', { name: 'ok', avatar: null })).rejects.toThrow()
    await expect(repo.save(a.key, { name: 'ok', avatar: 'https://external/avatar' })).rejects.toThrow()
  })
})
