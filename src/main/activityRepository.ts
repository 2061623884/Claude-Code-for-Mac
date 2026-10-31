import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { ActivityState } from './sessionActivity'

export interface ActivityRepository {
  load(id: string): ActivityState | undefined
  save(id: string, state: ActivityState): void
}
const pending = new Map<string, ActivityState>()
let timer: ReturnType<typeof setTimeout> | undefined
function path(id: string): string {
  if (!/^[\w-]{1,100}$/.test(id)) throw new Error('无效会话标识')
  return join(app.getPath('userData'), 'session-activity', `${id}.json`)
}
export const activityRepository: ActivityRepository = {
  load(id) {
    try {
      if (pending.has(id)) return structuredClone(pending.get(id))
      const file = path(id)
      if (!existsSync(file) || statSync(file).size > 16 * 1024 * 1024) return
      const data = JSON.parse(readFileSync(file, 'utf8')) as ActivityState
      if (data.version !== 1 || !Number.isFinite(data.revision) || !['tools', 'references', 'projects', 'tasks', 'agents'].every((k) => { const entries = data[k as keyof ActivityState]; return Array.isArray(entries) && entries.every((item) => item && typeof item.id === 'string') })) return
      return data
    } catch { return undefined }
  },
  save(id, state) {
    pending.set(id, state)
    timer ??= setTimeout(flushActivityRepository, 500)
  }
}
export function flushActivityRepository(): void {
  if (timer) clearTimeout(timer)
  timer = undefined
  for (const [id, state] of pending) {
    try {
      const file = path(id)
      mkdirSync(join(app.getPath('userData'), 'session-activity'), { recursive: true })
      writeFileSync(file + '.tmp', JSON.stringify(state))
      renameSync(file + '.tmp', file)
    } catch (error) { console.error('保存会话摘要失败', error) }
  }
  pending.clear()
}
