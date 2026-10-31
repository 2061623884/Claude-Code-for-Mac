import type { McpStatus } from '@shared/chat'
const MCP_STATUS: Record<McpStatus['status'], { label: string; color: string }> = {
  connected: { label: '已连接', color: '#788c5d' },
  pending: { label: '连接中', color: '#a3a093' },
  'needs-auth': { label: '需要授权', color: '#c6a27a' },
  failed: { label: '连接失败', color: 'var(--danger)' },
  disabled: { label: '已停用', color: '#a3a093' }
}

export function McpStatusList({ list }: { list: McpStatus[] }) {
  return (
    <div className="-mx-1.5 space-y-0.5">
      {list.map((s, i) => {
        const st = MCP_STATUS[s.status]
        return (
          <div
            key={s.name}
            className="animate-fade-up flex items-start gap-2.5 rounded-lg px-1.5 py-1.5"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <span className="mt-[7px] size-2 shrink-0 rounded-full" style={{ background: st.color }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate font-medium">{s.name}</span>
                <span className="shrink-0 text-[12px] text-fg3">
                  {st.label}
                  {s.status === 'connected' && ` · ${s.tools} 个工具`}
                  {s.scope && ` · ${s.scope}`}
                </span>
              </div>
              {s.error && <div className="mt-0.5 text-[12px] text-danger select-text">{s.error}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
