import type { SessionSummary } from '../shared/types'
import { sessionTitle } from '../shared/format'
import { loadSdk } from './sdk'
import * as store from './store'

export async function list(projectPath: string): Promise<SessionSummary[]> {
  const sdk = await loadSdk()
  const archived = store.read().archived
  const infos = await sdk.listSessions({ dir: projectPath })
  return infos
    .map((s) => ({
      id: s.sessionId,
      title: sessionTitle(s),
      cwd: s.cwd ?? projectPath,
      lastModified: s.lastModified,
      archived: archived[s.sessionId] === true
    }))
    .sort((a, b) => b.lastModified - a.lastModified)
}

export async function rename(id: string, title: string, projectPath: string): Promise<void> {
  const sdk = await loadSdk()
  await sdk.renameSession(id, title, { dir: projectPath })
}

/** 归档只记在应用自己的存储里，不改 Claude 的会话文件 */
export function setArchived(id: string, archived: boolean): void {
  store.update((d) => {
    if (archived) d.archived[id] = true
    else delete d.archived[id]
  })
}
