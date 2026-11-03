import { useDesk } from '../store'
import { useEffect, useRef, useState } from 'react'
import type { ClaudeConfigSnapshot } from '@shared/claudeConfig'
import { errorText } from '../ipcError'

interface ConfigView {
  cwd: string
  snapshot: ClaudeConfigSnapshot | null
  error: string | null
  saving: string | null
  results: Record<string, { error?: string; status?: string }>
}
const empty = (cwd: string): ConfigView => ({ cwd, snapshot: null, error: null, saving: null, results: {} })

/** 读取、保存、重读共享请求版本；组件只负责设置项的呈现。 */
export function useClaudeConfig(cwd: string) {
  const [state, setState] = useState(() => empty(cwd))
  const [revision, setRevision] = useState(0)
  const request = useRef(0)
  const busy = useRef(false)

  useEffect(() => {
    const id = ++request.current
    busy.current = false
    setState(empty(cwd))
    void window.desk.meta.configSnapshot(cwd).then(
      snapshot => { if (request.current === id) setState({ ...empty(cwd), snapshot }) },
      error => { if (request.current === id) setState({ ...empty(cwd), error: errorText(error) }) }
    )
    return () => { request.current++ }
  }, [cwd, revision])

  async function save(key: string, value: string): Promise<void> {
    if (busy.current || state.cwd !== cwd || !state.snapshot) return
    busy.current = true
    const id = ++request.current
    setState(previous => ({ ...previous, saving: key }))
    let written = false
    try {
      await window.desk.meta.config(cwd, `${key}=${value}`)
      written = true
      if (request.current !== id) return
      let status = '已保存 · 后续启动生效'
      const route = useDesk.getState().view
      if (route.kind === 'settings' && route.sessionId && ['outputStyle', 'language', 'thinking'].includes(key)) {
        try {
          await window.desk.chat.control(route.sessionId, cwd, 'applySetting', JSON.stringify({ key, value }))
          status = '已保存 · 当前会话已应用'
        } catch (e) { status = '已保存 · 当前会话应用失败，请重载：' + errorText(e) }
      }
      const snapshot = await window.desk.meta.configSnapshot(cwd)
      if (request.current === id) setState(previous => ({ ...previous, snapshot, results: { ...previous.results, [key]: { status } } }))
    } catch (error) {
      if (request.current === id) setState(previous => ({
        ...previous,
        snapshot: written && previous.snapshot ? {
          ...previous.snapshot,
          items: previous.snapshot.items.map(item => item.key === key ? { ...item, value: null, source: 'unknown' } : item)
        } : previous.snapshot,
        results: { ...previous.results, [key]: { error: (written ? '已保存，但重新读取失败：' : '') + errorText(error) } }
      }))
    } finally {
      if (request.current === id) {
        busy.current = false
        setState(previous => ({ ...previous, saving: null }))
      }
    }
  }

  function refresh(): void {
    if (busy.current) return
    request.current++
    setState(empty(cwd))
    setRevision(value => value + 1)
  }

  return { ...(state.cwd === cwd ? state : empty(cwd)), save, refresh }
}
