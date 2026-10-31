import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SessionOptions, SessionQueue } from '../shared/chat'
export interface SessionPreferences { options?: SessionOptions; queue: SessionQueue }
export interface SessionPreferencesRepository { load(id: string): SessionPreferences | undefined; save(id: string, value: SessionPreferences): void }
export function createSessionPreferencesRepository(directory: () => string): SessionPreferencesRepository {
  const path = (id: string) => {
    if (!/^[\w-]{1,100}$/.test(id)) throw new Error('无效会话标识')
    return join(directory(), `${id}.json`)
  }
  return {
    load(id) {
      try {
        const data = JSON.parse(readFileSync(path(id), 'utf8'))
        if (data.version !== 1 || !Array.isArray(data.queue?.items)) throw new Error('会话配置损坏')
        return { options: data.options, queue: data.queue }
      } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e }
    },
    save(id, value) {
      const file = path(id)
      mkdirSync(directory(), { recursive: true })
      writeFileSync(file + '.tmp', JSON.stringify({ version: 1, ...value }), { mode: 0o600 })
      renameSync(file + '.tmp', file)
    }
  }
}
