import { useEffect, useRef, useState } from 'react'
import { Archive, MessageSquare, Search } from 'lucide-react'
import { relativeTimeZh } from '@shared/format'
import { useDesk } from '../../store'

const LIMIT = 50

/** ⌘K：按标题搜索所有项目里的会话（含已归档） */
export function SearchDialog() {
  const { projects, sessions, setView, setSearchOpen } = useDesk()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const list = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()
  const results = projects
    .flatMap((p) => (sessions[p.id] ?? []).map((s) => ({ session: s, project: p })))
    .filter(({ session, project }) => !q || session.title.toLowerCase().includes(q) || project.name.toLowerCase().includes(q))
    .sort((a, b) => b.session.lastModified - a.session.lastModified)
    .slice(0, LIMIT)
  const current = Math.min(active, Math.max(results.length - 1, 0))

  useEffect(() => {
    list.current?.children[current]?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const close = (): void => setSearchOpen(false)
  const open = (i: number): void => {
    const r = results[i]
    if (!r) return
    setView({ kind: 'session', sessionId: r.session.id, projectId: r.project.id })
    close()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-overlay pt-[14vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-label="搜索会话"
        className="flex h-fit max-h-[60vh] w-[580px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="shrink-0 text-fg3" />
          <input
            autoFocus
            value={query}
            placeholder="搜索会话标题或项目名"
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Escape') close()
              else if (e.key === 'Enter') open(current)
              else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const n = results.length || 1
                setActive((current + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
              } else return
              e.preventDefault()
            }}
            className="h-12 min-w-0 flex-1 bg-transparent text-[14.5px] outline-none select-text placeholder:text-fg3"
          />
        </div>
        <div ref={list} className="overflow-y-auto p-1.5">
          {results.length === 0 && <div className="py-8 text-center text-fg3">没有找到相关会话</div>}
          {results.map(({ session, project }, i) => (
            <div
              key={session.id}
              role="option"
              aria-selected={i === current}
              onMouseMove={() => i !== current && setActive(i)}
              onClick={() => open(i)}
              className={`flex h-10 items-center gap-2.5 rounded-lg px-2.5 ${i === current ? 'bg-active' : ''}`}
            >
              {session.archived ? (
                <Archive size={14} className="shrink-0 text-fg3" />
              ) : (
                <MessageSquare size={14} className="shrink-0 text-fg3" />
              )}
              <span className="min-w-0 flex-1 truncate">{session.title}</span>
              <span className="max-w-[160px] shrink-0 truncate text-[12px] text-fg3">{project.name}</span>
              <span className="w-[64px] shrink-0 text-right text-[12px] text-fg3">{relativeTimeZh(session.lastModified)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
