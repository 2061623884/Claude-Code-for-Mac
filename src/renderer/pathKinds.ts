// 路径是文件、文件夹还是不存在：整个应用共用一份缓存，同一时刻的查询合并成一次 IPC
import { useEffect, useState } from 'react'

export type PathKind = 'file' | 'dir' | null

const known = new Map<string, PathKind>()
const waiting = new Map<string, Set<() => void>>()
let timer: ReturnType<typeof setTimeout> | null = null

function flush(): void {
  timer = null
  const paths = [...waiting.keys()].filter((p) => !known.has(p))
  if (!paths.length) return
  window.desk.files.stat(paths).then(
    (result) => {
      for (const p of paths) {
        known.set(p, result[p] ?? null)
        for (const done of waiting.get(p) ?? []) done()
        waiting.delete(p)
      }
    },
    () => paths.forEach((p) => waiting.delete(p))
  )
}

/** undefined 表示还在查询 */
export function usePathKind(path: string | null): PathKind | undefined {
  const [, rerender] = useState(0)
  useEffect(() => {
    if (!path || known.has(path)) return
    const done = (): void => rerender((n) => n + 1)
    const set = waiting.get(path) ?? new Set()
    set.add(done)
    waiting.set(path, set)
    timer ??= setTimeout(flush, 0)
    return () => void waiting.get(path)?.delete(done)
  }, [path])
  return path ? known.get(path) : null
}
