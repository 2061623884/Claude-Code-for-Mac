import type { SessionSummary } from '../shared/types'
import { sessionTitle } from '../shared/format'
import { loadSdk } from './sdk'
import * as store from './store'

/** Desktop IDs stay stable while Claude stores each edited history separately. */
export function historyIds(id: string): string[] {
  return [id, ...(store.read().sessionEdits?.[id] ?? [])]
}

export function recordEdit(id: string, historyId: string): void {
  store.update(d => { d.sessionEdits[id] = [...(d.sessionEdits[id] ?? []), historyId] })
}

export async function list(projectPath: string): Promise<SessionSummary[]> {
  const sdk = await loadSdk()
  const infos = await sdk.listSessions({ dir: projectPath })
  const { archived, sessionEdits = {} } = store.read()
  const rows = new Map(infos.map(info => [info.sessionId, info]))
  const editedHistories = new Set(Object.values(sessionEdits).flat())
  const ids = new Set([...rows.keys(), ...Object.keys(sessionEdits)])
  return [...ids].flatMap(id => {
    if (editedHistories.has(id)) return []
    const latest = (sessionEdits[id] ?? []).findLast(historyId => rows.has(historyId))
    const original = rows.get(id)
    const active = latest ? rows.get(latest) : original
    const session = original ?? active
    if (!session) return []
    return [{
      id,
      title: sessionTitle(session),
      cwd: session.cwd ?? projectPath,
      lastModified: active?.lastModified ?? session.lastModified,
      archived: archived[id] === true
    }]
  })
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
