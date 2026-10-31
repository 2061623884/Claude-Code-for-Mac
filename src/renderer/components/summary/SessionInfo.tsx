import { useEffect, useState } from 'react'
import type { ContextUsage, McpStatus, ChatSnapshot } from '@shared/chat'
import { useChat } from '../../chatStore'
import { ContextBreakdown } from '../chat/ContextMeter'
import { McpStatusList } from '../commands/McpStatusList'
export function SessionInfo({ sessionId, cwd, active }: { sessionId: string; cwd: string; active: boolean }) {
  const [open, setOpen] = useState(false),
    [refresh, setRefresh] = useState(0)
  const [context, setContext] = useState<ContextUsage | null>(null),
    [mcp, setMcp] = useState<McpStatus[] | null>(null)
  const [errors, setErrors] = useState<string[]>([]),
    [loading, setLoading] = useState(false)
  const [info, setInfo] = useState<Pick<ChatSnapshot, 'runtime' | 'live'> | null>(null)
  const chat = useChat((s) => s.chats[sessionId])
  const model = chat?.options.model ?? null
  useEffect(() => {
    if (!open || !active) return
    let stale = false
    setLoading(true)
    setErrors([])
    void Promise.allSettled([
      window.desk.chat.context(sessionId, cwd, model),
      window.desk.chat.mcp(sessionId, cwd),
      window.desk.chat.open(sessionId, cwd)
    ]).then(([a, b, c]) => {
      if (stale) return
      setInfo(c.status === 'fulfilled' ? { live: c.value.live, runtime: c.value.runtime } : null)
      setContext(a.status === 'fulfilled' ? a.value : null)
      setMcp(b.status === 'fulfilled' ? b.value : null)
      setErrors([a, b, c].flatMap((r) => (r.status === 'rejected' ? [String(r.reason)] : [])))
      setLoading(false)
    })
    return () => {
      stale = true
    }
  }, [open, active, sessionId, cwd, model, chat?.live, chat?.options.mode, refresh])
  return (
    <section className="border-b border-line py-3">
      <button aria-expanded={open} onClick={() => setOpen(!open)} className="w-full text-left text-sm font-medium">
        {open ? '⌄' : '›'} 会话信息
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-xs text-fg2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
            <dt>运行环境</dt>
            <dd>本机 · {info ? (info.live ? '会话进程已连接' : '会话进程未连接') : '连接状态未知'}</dd>
            <dt>工作目录</dt>
            <dd className="break-all select-text">{info?.runtime?.cwd ?? cwd}</dd>
            <dt>模型</dt>
            <dd>{info?.runtime?.model ?? '未知（SDK 未返回）'}</dd>
            <dt>权限</dt>
            <dd>
              {info?.runtime?.permissionMode
                ? ((
                    {
                      default: '手动确认',
                      acceptEdits: '自动接受编辑',
                      plan: '计划模式',
                      auto: '自动',
                      bypassPermissions: '跳过权限确认',
                      dontAsk: '禁止权限提示'
                    } as Record<string, string>
                  )[info.runtime.permissionMode] ?? info.runtime.permissionMode)
                : '未知（SDK 未返回）'}
            </dd>
          </dl>
          <button
            className="text-accent disabled:opacity-50"
            disabled={loading}
            onClick={() => setRefresh((n) => n + 1)}
          >
            {loading ? '正在刷新…' : '刷新状态'}
          </button>
          {errors.map((e) => (
            <p key={e} role="alert" className="text-danger">
              {e}
            </p>
          ))}
          {context ? (
            <ContextBreakdown usage={context} />
          ) : (
            <p className="text-fg3">上下文占用：{loading ? '读取中' : '未知'}</p>
          )}
          <h4 className="font-medium">连接器状态</h4>
          {mcp ? (
            mcp.length ? (
              <McpStatusList list={mcp} />
            ) : (
              <p>没有配置 MCP 服务器</p>
            )
          ) : (
            <p>{loading ? '读取中' : '未知'}</p>
          )}
        </div>
      )}
    </section>
  )
}
