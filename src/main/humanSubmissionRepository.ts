import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface HumanSubmission { uuid: string; text: string; time: number }
export interface HumanSubmissionRepository {
  load(sessionId: string): HumanSubmission[]
  save(sessionId: string, submissions: HumanSubmission[]): void
}

/** 仅保存本应用发送过的原文；按 UUID 与 SDK 历史关联，不向 SDK 注入历史。 */
export function createHumanSubmissionRepository(directory: () => string): HumanSubmissionRepository {
  const file = (id: string): string => {
    if (!/^[\w-]{1,100}$/.test(id)) throw new Error('无效会话标识')
    return join(directory(), `${id}.json`)
  }
  return {
    load(id) {
      try {
        const data = JSON.parse(readFileSync(file(id), 'utf8'))
        if (data.version !== 1 || !Array.isArray(data.submissions) || !data.submissions.every((s: HumanSubmission) => s && typeof s.uuid === 'string' && typeof s.text === 'string' && Number.isFinite(s.time))) throw new Error('无效的真人提交记录')
        return data.submissions
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw error // 不在损坏或读取失败时覆盖已有原文。
      }
    },
    save(id, submissions) {
      const path = file(id)
      mkdirSync(directory(), { recursive: true })
      writeFileSync(path + '.tmp', JSON.stringify({ version: 1, submissions }), { mode: 0o600 })
      renameSync(path + '.tmp', path)
    }
  }
}
