// 定时任务调度：任务列表存到 userData/schedules.json，应用运行期间每 30 秒检查一次到点的任务，
// 到点后在对应项目里新开一个会话执行。应用关闭期间错过的时间点不补跑，重新打开后从当前时间算下一次。
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { SessionOptions } from '../shared/chat'
import { nextRunAt, validateSchedule, type ScheduledRunStarted, type ScheduledTask, type ScheduledTaskInput } from '../shared/schedules'

const TICK_MS = 30_000

export interface SchedulerDeps {
  file(): string
  options(task: ScheduledTask): SessionOptions
  start(projectPath: string, prompt: string, options: SessionOptions): string
  isBusy(sessionId: string): boolean
  onStarted(run: ScheduledRunStarted): void
  onChanged(tasks: ScheduledTask[]): void
  now?(): number
}

function validate(input: ScheduledTaskInput): ScheduledTaskInput {
  const name = input.name?.trim()
  const prompt = input.prompt?.trim()
  if (!name) throw new Error('请填写任务名称')
  if (!prompt) throw new Error('请填写要执行的提示词')
  if (!input.projectPath) throw new Error('请选择项目')
  validateSchedule(input.schedule)
  return { name, prompt, projectPath: input.projectPath, schedule: input.schedule, mode: input.mode, enabled: input.enabled !== false }
}

export class Scheduler {
  private tasks: ScheduledTask[] | undefined
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(private deps: SchedulerDeps) {}

  private now(): number { return this.deps.now?.() ?? Date.now() }

  list(): ScheduledTask[] {
    if (!this.tasks) {
      const file = this.deps.file()
      const loaded = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as { tasks?: ScheduledTask[] }).tasks ?? [] : []
      const now = this.now()
      // 关闭期间错过的时间点直接跳过
      this.tasks = loaded.map(task => task.enabled && (task.nextRunAt === null || task.nextRunAt <= now) ? { ...task, nextRunAt: this.next(task, now) } : task)
    }
    return structuredClone(this.tasks)
  }

  private next(task: ScheduledTaskInput, after: number): number | null {
    try { return task.enabled ? nextRunAt(task.schedule, after) : null } catch { return null }
  }

  private save(tasks: ScheduledTask[]): ScheduledTask[] {
    const file = this.deps.file()
    writeFileSync(file + '.tmp', JSON.stringify({ version: 1, tasks }, null, 2))
    renameSync(file + '.tmp', file)
    this.tasks = tasks
    const copy = structuredClone(tasks)
    this.deps.onChanged(copy)
    return copy
  }

  create(input: ScheduledTaskInput): ScheduledTask[] {
    const clean = validate(input)
    const now = this.now()
    return this.save([...this.list(), { ...clean, id: randomUUID(), createdAt: now, nextRunAt: this.next(clean, now) }])
  }

  update(id: string, input: ScheduledTaskInput): ScheduledTask[] {
    const clean = validate(input)
    const tasks = this.list()
    const index = tasks.findIndex(task => task.id === id)
    if (index < 0) throw new Error('定时任务不存在')
    tasks[index] = { ...tasks[index], ...clean, nextRunAt: this.next(clean, this.now()) }
    return this.save(tasks)
  }

  setEnabled(id: string, enabled: boolean): ScheduledTask[] {
    const task = this.list().find(task => task.id === id)
    if (!task) throw new Error('定时任务不存在')
    return this.update(id, { ...task, enabled })
  }

  remove(id: string): ScheduledTask[] {
    return this.save(this.list().filter(task => task.id !== id))
  }

  /** 立即执行一次，不改变下一次计划时间 */
  runNow(id: string): ScheduledTask[] {
    const tasks = this.list()
    const task = tasks.find(task => task.id === id)
    if (!task) throw new Error('定时任务不存在')
    const run = task.lastRun = this.run(task)
    const saved = this.save(tasks)
    if (run.error || run.skipped) throw new Error(run.error ?? run.skipped)
    return saved
  }

  private run(task: ScheduledTask): NonNullable<ScheduledTask['lastRun']> {
    const at = this.now()
    if (task.lastRun?.sessionId && this.deps.isBusy(task.lastRun.sessionId)) return { at, sessionId: task.lastRun.sessionId, skipped: '上一次运行尚未结束，本次已跳过' }
    if (!existsSync(task.projectPath)) return { at, error: `项目目录不存在：${task.projectPath}` }
    try {
      const sessionId = this.deps.start(task.projectPath, task.prompt, this.deps.options(task))
      this.deps.onStarted({ taskId: task.id, taskName: task.name, sessionId, projectPath: task.projectPath })
      return { at, sessionId }
    } catch (error) {
      return { at, error: error instanceof Error ? error.message : String(error) }
    }
  }

  tick(): void {
    const now = this.now()
    const tasks = this.list()
    let changed = false
    for (const task of tasks) {
      if (!task.enabled || task.nextRunAt === null || task.nextRunAt > now) continue
      task.lastRun = this.run(task)
      task.nextRunAt = this.next(task, now)
      changed = true
    }
    if (changed) this.save(tasks)
  }

  startTimer(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      try { this.tick() } catch (error) { console.error('[schedules]', error) }
    }, TICK_MS)
    this.timer.unref?.()
  }

  stopTimer(): void {
    clearInterval(this.timer)
    this.timer = undefined
  }
}
