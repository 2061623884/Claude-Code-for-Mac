import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'
import { describeSchedule, nextRunAt, parseCron, validateSchedule } from '../src/shared/schedules'
import { Scheduler, type SchedulerDeps } from '../src/main/schedules'

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime()

it('computes the next daily run after the given time', () => {
  expect(nextRunAt({ kind: 'daily', time: '09:00' }, at(2026, 11, 6, 8, 30))).toBe(at(2026, 11, 6, 9, 0))
  expect(nextRunAt({ kind: 'daily', time: '09:00' }, at(2026, 11, 6, 9, 0))).toBe(at(2026, 11, 7, 9, 0))
})

it('computes weekly runs on the selected days only', () => {
  // 2026-11-06 is a Friday
  expect(nextRunAt({ kind: 'weekly', days: [1], time: '10:00' }, at(2026, 11, 6, 12))).toBe(at(2026, 11, 9, 10))
  expect(nextRunAt({ kind: 'weekly', days: [5], time: '10:00' }, at(2026, 11, 6, 12))).toBe(at(2026, 11, 13, 10))
})

it('adds the interval to the reference time', () => {
  expect(nextRunAt({ kind: 'interval', minutes: 30 }, at(2026, 11, 6, 8))).toBe(at(2026, 11, 6, 8, 30))
})

it('supports cron lists, ranges, steps and weekday matching', () => {
  expect(nextRunAt({ kind: 'cron', expression: '0 9 * * 1-5' }, at(2026, 11, 6, 9, 0))).toBe(at(2026, 11, 9, 9, 0))
  expect(nextRunAt({ kind: 'cron', expression: '*/15 * * * *' }, at(2026, 11, 6, 8, 1))).toBe(at(2026, 11, 6, 8, 15))
  expect(nextRunAt({ kind: 'cron', expression: '30 8,20 1 * *' }, at(2026, 11, 6))).toBe(at(2026, 12, 1, 8, 30))
  expect(parseCron('0 0 * * 7').weekdays.has(0)).toBe(true)
})

it('rejects invalid schedules', () => {
  expect(() => validateSchedule({ kind: 'interval', minutes: 1 })).toThrow('间隔至少')
  expect(() => validateSchedule({ kind: 'daily', time: '25:00' })).toThrow('HH:mm')
  expect(() => validateSchedule({ kind: 'weekly', days: [], time: '09:00' })).toThrow('至少选择一天')
  expect(() => validateSchedule({ kind: 'cron', expression: '0 9 * *' })).toThrow('5 段')
  expect(() => validateSchedule({ kind: 'cron', expression: '61 * * * *' })).toThrow('超出范围')
})

it('describes schedules in Chinese', () => {
  expect(describeSchedule({ kind: 'weekly', days: [5, 1, 2, 3, 4], time: '09:00' })).toBe('工作日 09:00')
  expect(describeSchedule({ kind: 'interval', minutes: 120 })).toBe('每 2 小时')
})

let now: number
let deps: SchedulerDeps & { start: ReturnType<typeof vi.fn>; isBusy: ReturnType<typeof vi.fn>; onStarted: ReturnType<typeof vi.fn> }
let dir: string
const input = (patch = {}) => ({ name: '汇总', projectPath: dir, prompt: '总结昨天的提交', schedule: { kind: 'daily' as const, time: '09:00' }, mode: 'default' as const, enabled: true, ...patch })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'schedules-'))
  now = at(2026, 11, 6, 8, 0)
  deps = {
    file: () => join(dir, 'schedules.json'),
    options: (task) => ({ model: null, mode: task.mode, effort: null }),
    start: vi.fn(() => 'session-1'),
    isBusy: vi.fn(() => false),
    onStarted: vi.fn(),
    onChanged: vi.fn(),
    now: () => now
  }
})

it('runs due tasks once and schedules the next occurrence', () => {
  const scheduler = new Scheduler(deps)
  const [task] = scheduler.create(input())
  expect(task.nextRunAt).toBe(at(2026, 11, 6, 9))
  scheduler.tick()
  expect(deps.start).not.toHaveBeenCalled()
  now = at(2026, 11, 6, 9, 0)
  scheduler.tick()
  scheduler.tick()
  expect(deps.start).toHaveBeenCalledTimes(1)
  expect(deps.start).toHaveBeenCalledWith(dir, '总结昨天的提交', { model: null, mode: 'default', effort: null })
  expect(deps.onStarted).toHaveBeenCalledWith({ taskId: task.id, taskName: '汇总', sessionId: 'session-1', projectPath: dir })
  const [saved] = scheduler.list()
  expect(saved.lastRun).toEqual({ at: now, sessionId: 'session-1' })
  expect(saved.nextRunAt).toBe(at(2026, 11, 7, 9))
  expect(JSON.parse(readFileSync(deps.file(), 'utf-8')).tasks[0].lastRun.sessionId).toBe('session-1')
})

it('skips a run while the previous session is still busy', () => {
  const scheduler = new Scheduler(deps)
  const [task] = scheduler.create(input({ schedule: { kind: 'interval', minutes: 30 } }))
  now += 30 * 60_000
  scheduler.tick()
  deps.isBusy.mockReturnValue(true)
  now += 30 * 60_000
  scheduler.tick()
  expect(deps.start).toHaveBeenCalledTimes(1)
  expect(scheduler.list()[0].lastRun).toMatchObject({ sessionId: 'session-1', skipped: expect.any(String) })
  expect(task.id).toBe(scheduler.list()[0].id)
})

it('does not run disabled tasks and does not catch up missed runs after restart', () => {
  writeFileSync(deps.file(), JSON.stringify({ version: 1, tasks: [{ ...input(), id: 'a', createdAt: 0, nextRunAt: at(2026, 11, 5, 9) }] }))
  const scheduler = new Scheduler(deps)
  expect(scheduler.list()[0].nextRunAt).toBe(at(2026, 11, 6, 9))
  scheduler.tick()
  expect(deps.start).not.toHaveBeenCalled()
  scheduler.setEnabled('a', false)
  now = at(2026, 11, 6, 9)
  scheduler.tick()
  expect(deps.start).not.toHaveBeenCalled()
  expect(scheduler.list()[0].nextRunAt).toBeNull()
})

it('records a failed start and reports it from runNow', () => {
  const scheduler = new Scheduler(deps)
  const [task] = scheduler.create(input())
  deps.start.mockImplementation(() => { throw new Error('boom') })
  expect(() => scheduler.runNow(task.id)).toThrow('boom')
  expect(() => scheduler.create(input({ name: ' ' }))).toThrow('名称')
})
