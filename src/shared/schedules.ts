// 定时任务：数据结构与下次运行时间计算。主进程调度和渲染进程展示共用。
import type { PermissionMode } from './types'

export type Schedule =
  | { kind: 'interval'; minutes: number }
  | { kind: 'daily'; time: string }
  | { kind: 'weekly'; days: number[]; time: string }
  | { kind: 'cron'; expression: string }

export interface ScheduledTaskInput {
  name: string
  projectPath: string
  prompt: string
  schedule: Schedule
  mode: PermissionMode
  enabled: boolean
}

export interface ScheduledTaskRun {
  at: number
  sessionId?: string
  error?: string
  skipped?: string
}

export interface ScheduledTask extends ScheduledTaskInput {
  id: string
  createdAt: number
  nextRunAt: number | null
  lastRun?: ScheduledTaskRun
}

export interface ScheduledRunStarted {
  taskId: string
  taskName: string
  sessionId: string
  projectPath: string
}

export const MIN_INTERVAL_MINUTES = 5
export const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function parseTime(time: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  const hour = Number(match?.[1])
  const minute = Number(match?.[2])
  if (!match || hour > 23 || minute > 59) throw new Error('时间格式应为 HH:mm')
  return [hour, minute]
}

function cronField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>()
  for (const part of field.split(',')) {
    const [range, stepText] = part.split('/')
    const step = stepText === undefined ? 1 : Number(stepText)
    if (!Number.isInteger(step) || step < 1) throw new Error(`cron 步长无效：${part}`)
    let [from, to] = [min, max]
    if (range !== '*') {
      const [a, b] = range.split('-')
      from = Number(a)
      to = b === undefined ? (stepText === undefined ? from : max) : Number(b)
    }
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < min || to > max || from > to) throw new Error(`cron 取值超出范围：${part}`)
    for (let v = from; v <= to; v += step) values.add(v)
  }
  return values
}

/** 解析五段 cron（分 时 日 月 周），支持 *、列表、范围和步长；周日可写 0 或 7。 */
export function parseCron(expression: string) {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) throw new Error('cron 需要 5 段：分 时 日 月 周')
  const [minute, hour, day, month, weekday] = fields
  const weekdays = cronField(weekday, 0, 7)
  if (weekdays.delete(7)) weekdays.add(0)
  return {
    minutes: cronField(minute, 0, 59), hours: cronField(hour, 0, 23), days: cronField(day, 1, 31), months: cronField(month, 1, 12), weekdays,
    anyDay: day === '*', anyWeekday: weekday === '*'
  }
}

export function validateSchedule(schedule: Schedule): void {
  if (schedule.kind === 'interval') {
    if (!Number.isInteger(schedule.minutes) || schedule.minutes < MIN_INTERVAL_MINUTES) throw new Error(`间隔至少 ${MIN_INTERVAL_MINUTES} 分钟`)
  } else if (schedule.kind === 'daily') parseTime(schedule.time)
  else if (schedule.kind === 'weekly') {
    parseTime(schedule.time)
    if (!schedule.days.length || schedule.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('请至少选择一天')
  } else if (schedule.kind === 'cron') parseCron(schedule.expression)
  else throw new Error('未知的定时方式')
}

/** 严格晚于 after 的下一次运行时间（本地时区，精确到分钟）。 */
export function nextRunAt(schedule: Schedule, after: number): number | null {
  if (schedule.kind === 'interval') return after + schedule.minutes * 60_000
  const start = new Date(after)
  start.setSeconds(0, 0)
  start.setMinutes(start.getMinutes() + 1)
  if (schedule.kind === 'daily' || schedule.kind === 'weekly') {
    const [hour, minute] = parseTime(schedule.time)
    const days = schedule.kind === 'weekly' ? new Set(schedule.days) : null
    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, hour, minute)
      if (candidate.getTime() >= start.getTime() && (!days || days.has(candidate.getDay()))) return candidate.getTime()
    }
    return null
  }
  const cron = parseCron(schedule.expression)
  const candidate = new Date(start)
  // 最多向后找约一年，覆盖 2 月 29 日之外的所有常见表达式
  for (let i = 0; i < 366 * 24 * 60; i++) {
    const dayMatch = cron.anyDay || cron.anyWeekday
      ? cron.days.has(candidate.getDate()) && cron.weekdays.has(candidate.getDay())
      : cron.days.has(candidate.getDate()) || cron.weekdays.has(candidate.getDay())
    if (!cron.months.has(candidate.getMonth() + 1) || !dayMatch) {
      candidate.setDate(candidate.getDate() + 1)
      candidate.setHours(0, 0, 0, 0)
      continue
    }
    if (!cron.hours.has(candidate.getHours())) {
      candidate.setHours(candidate.getHours() + 1, 0, 0, 0)
      continue
    }
    if (cron.minutes.has(candidate.getMinutes())) return candidate.getTime()
    candidate.setMinutes(candidate.getMinutes() + 1, 0, 0)
  }
  return null
}

export function describeSchedule(schedule: Schedule): string {
  if (schedule.kind === 'interval') return schedule.minutes % 60 === 0 ? `每 ${schedule.minutes / 60} 小时` : `每 ${schedule.minutes} 分钟`
  if (schedule.kind === 'daily') return `每天 ${schedule.time}`
  if (schedule.kind === 'weekly') {
    const days = [...schedule.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    const label = days.length === 7 ? '每天' : days.join() === '1,2,3,4,5' ? '工作日' : days.map(d => WEEKDAY_LABELS[d]).join('、')
    return `${label} ${schedule.time}`
  }
  return `cron ${schedule.expression}`
}
