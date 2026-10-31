import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CommandCatalog } from '../src/main/commandCatalog'
import type { CommandInfo } from '../src/shared/types'
const command = (name: string): CommandInfo => ({ name, description: name, argumentHint: '' })
let directory: string, configuration: string, now: number, catalog: CommandCatalog
const load = vi.fn(), publish = vi.fn()
beforeEach(() => {
  vi.clearAllMocks(); directory = mkdtempSync(join(tmpdir(), 'claude-command-catalog-')); configuration = 'bundled'; now = 1_000_000
  catalog = new CommandCatalog({ directory: () => directory, configuration: () => configuration, now: () => now, load, publish })
})
afterEach(() => { catalog.close(); vi.useRealTimers(); rmSync(directory, { recursive: true, force: true }) })
it('returns init immediately, coalesces concurrent queries and replaces fallback with the real list', async () => {
  let done!: (commands: CommandInfo[]) => void
  load.mockImplementation(() => new Promise((resolve) => { done = resolve }))
  expect(catalog.get('/a').commands.map(c=>c.name)).toContain('init')
  catalog.get('/a'); catalog.get('/a', true)
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1))
  done([command('custom')])
  await vi.waitFor(() => expect(catalog.get('/a').status).toBe('ready'))
  expect(catalog.get('/a').commands).toEqual([command('custom')])
})
it('reuses disk snapshots and refreshes stale entries without hiding cached commands', async () => {
  catalog.publisher('/a')([command('cached')]); catalog.close()
  catalog = new CommandCatalog({ directory: () => directory, configuration: () => configuration, now: () => now, load, publish })
  expect(catalog.get('/a').commands[0].name).toBe('cached'); expect(load).not.toHaveBeenCalled()
  now += 300001; load.mockResolvedValue([command('fresh')])
  expect(catalog.get('/a')).toMatchObject({ status: 'loading', commands: [command('cached')] })
  await vi.waitFor(() => expect(catalog.get('/a').commands[0].name).toBe('fresh'))
})
it('isolates projects and executable configurations and rejects late old-query results', async () => {
  let done!: (commands: CommandInfo[]) => void
  load.mockImplementation(() => new Promise((resolve) => { done = resolve }))
  catalog.get('/a'); await vi.waitFor(()=>expect(load).toHaveBeenCalledTimes(1))
  const oldPublish = catalog.publisher('/a')
  configuration = 'custom'; catalog.invalidate()
  catalog.publisher('/a')([command('new-executable')]); catalog.publisher('/b')([command('project-b')])
  oldPublish([command('old-executable')]); done([command('late-old-query')]); await Promise.resolve()
  expect(catalog.get('/a').commands[0].name).toBe('new-executable')
  expect(catalog.get('/b').commands[0].name).toBe('project-b')
})
it('lets an existing session update win over a slower temporary query', async () => {
  let done!: (commands: CommandInfo[])=>void
  load.mockImplementation(()=>new Promise(resolve=>{done=resolve}))
  catalog.get('/a'); await vi.waitFor(()=>expect(load).toHaveBeenCalledTimes(1))
  const signal = load.mock.calls[0][1] as AbortSignal
  catalog.publisher('/a')([command('live-skill')]); done([command('outdated')]); await Promise.resolve()
  expect(signal.aborted).toBe(true)
  expect(catalog.get('/a').commands[0].name).toBe('live-skill')
})
it('retains useful commands on failure and permits a manual retry', async () => {
  catalog.publisher('/a')([command('cached')]); now += 300001
  load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([command('recovered')])
  catalog.get('/a')
  await vi.waitFor(()=>expect(catalog.get('/a').status).toBe('error'))
  expect(catalog.get('/a').commands).toEqual([command('cached')])
  expect(load).toHaveBeenCalledTimes(1)
  catalog.get('/a',true)
  await vi.waitFor(()=>expect(catalog.get('/a').commands[0].name).toBe('recovered'))
})
it('times out after fifteen seconds and aborts owned requests on close', async () => {
  vi.useFakeTimers(); load.mockImplementation(()=>new Promise(()=>{}))
  catalog.get('/a'); await Promise.resolve()
  await vi.advanceTimersByTimeAsync(15000)
  expect(catalog.get('/a')).toMatchObject({status:'error', error:expect.stringContaining('超时')})
  expect(load.mock.calls[0][1].aborted).toBe(true)
  catalog.get('/b'); await Promise.resolve(); catalog.close()
  expect(load.mock.calls[1][1].aborted).toBe(true)
  await vi.runAllTimersAsync()
})
