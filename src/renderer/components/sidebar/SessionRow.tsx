import { useState } from 'react'
import { Archive, ArchiveRestore, Pencil } from 'lucide-react'
import type { ChatState } from '@shared/chat'
import type { SessionSummary } from '@shared/types'
import { relativeTimeZh } from '@shared/format'

interface SessionRowProps {
  session: SessionSummary
  active: boolean
  status?: ChatState
  indent?: boolean
  onOpen(): void
  onRename(title: string): void
  onArchive(archived: boolean): void
}

export function SessionRow({ session, active, status, indent = true, onOpen, onRename, onArchive }: SessionRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.title)

  const finish = (save: boolean): void => {
    setEditing(false)
    if (save) onRename(draft)
    else setDraft(session.title)
  }

  if (editing) {
    return (
      <div className={`flex h-8 items-center rounded-lg bg-active pr-2 ${indent ? 'pl-8' : 'pl-2.5'}`}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') finish(true)
            if (e.key === 'Escape') finish(false)
          }}
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      title={session.title}
      className={`group flex h-8 items-center gap-2 rounded-lg pr-2 ${indent ? 'pl-8' : 'pl-2.5'} ${
        active ? 'bg-active' : 'hover:bg-hover'
      }`}
    >
      <span className={`min-w-0 flex-1 truncate ${active ? 'text-fg' : 'text-fg/85'}`}>{session.title}</span>
      {status === 'running' && <span title="运行中" className="size-2 shrink-0 animate-pulse rounded-full bg-fg3 group-hover:hidden" />}
      {status === 'awaiting' && <span title="等待你确认" className="size-2 shrink-0 rounded-full bg-accent group-hover:hidden" />}
      <span className="shrink-0 text-[11.5px] text-fg3 group-hover:hidden">{relativeTimeZh(session.lastModified)}</span>
      <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        {!session.archived && (
          <IconButton
            label="重命名"
            onClick={() => {
              setDraft(session.title)
              setEditing(true)
            }}
          >
            <Pencil size={13} />
          </IconButton>
        )}
        <IconButton label={session.archived ? '取消归档' : '归档'} onClick={() => onArchive(!session.archived)}>
          {session.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
        </IconButton>
      </span>
    </div>
  )
}

export function IconButton({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="flex size-6 items-center justify-center rounded-md text-fg2 hover:bg-active hover:text-fg"
    >
      {children}
    </button>
  )
}
