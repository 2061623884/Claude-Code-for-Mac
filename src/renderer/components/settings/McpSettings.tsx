import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { McpStatus } from '@shared/chat'
import { errorText } from '../../ipcError'
const STATUS: Record<McpStatus['status'], string> = { connected: '已连接', pending: '连接中', 'needs-auth': '需要授权', failed: '连接失败', disabled: '已停用' }
export function McpSettings({ sessionId, cwd }: { sessionId: string | null; cwd: string }) {
  const [list, setList] = useState<McpStatus[] | null>(null), [error, setError] = useState<string | null>(null), [revision, setRevision] = useState(0)
  useEffect(() => {
    let cancelled = false; setList(null); setError(null)
    window.desk.chat.mcp(sessionId, cwd).then(value => { if (!cancelled) setList(value) }, e => { if (!cancelled) setError(errorText(e)) })
    return () => { cancelled = true }
  }, [sessionId, cwd, revision])
  return <section aria-label="MCP 服务" className="mt-5">
    <div className="mb-3 flex justify-end"><button type="button" onClick={() => setRevision(n => n + 1)} aria-label="刷新 MCP" className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-fg2 hover:bg-hover"><RefreshCw size={13} />刷新</button></div>
    {error ? <p role="alert" className="text-danger">{error}</p> : !list ? <p className="text-fg3">读取中…</p> : !list.length ? <p className="text-fg3">没有配置 MCP 服务器。</p> : <div className="divide-y divide-line rounded-xl border border-line">{list.map(server => <div key={server.name} className="px-4 py-3">
      <div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate font-medium">{server.name}</span><span className={`shrink-0 text-[12px] ${server.status === 'failed' ? 'text-danger' : 'text-fg2'}`}>{STATUS[server.status] ?? server.status}</span></div>
      <div className="mt-1 text-[12px] text-fg3">{server.tools} 个工具{server.scope ? ` · ${server.scope}` : ''}</div>
      {server.error && <p className="mt-2 break-words text-[12px] text-danger">{server.error}</p>}
    </div>)}</div>}
  </section>
}
