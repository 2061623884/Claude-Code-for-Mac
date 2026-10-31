import { useEffect, useState } from 'react'
import type { ContextUsage } from '@shared/chat'

/** 活跃会话每 10 秒顺序读取一次；切换会话时旧请求不能覆盖新值。 */
export function useContextUsage(sessionId: string, cwd: string | undefined, model: string | null, loaded: boolean, idle: boolean): ContextUsage | null {
  const [snapshot, setSnapshot] = useState<{ key: string; usage: ContextUsage | null } | null>(null)
  const key = JSON.stringify([sessionId, cwd, model])
  useEffect(() => {
    if (!loaded || !cwd) return
    let stale = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async (): Promise<void> => {
      try {
        const usage = await window.desk.chat.context(sessionId, cwd, model)
        if (!stale) setSnapshot({ key, usage })
      } catch {
        if (!stale) setSnapshot({ key, usage: null })
      } finally {
        if (!stale && !idle) timer = setTimeout(() => void refresh(), 10_000)
      }
    }
    void refresh()
    return () => { stale = true; clearTimeout(timer) }
  }, [sessionId, cwd, model, loaded, idle, key])
  return loaded && snapshot?.key === key ? snapshot.usage : null
}
