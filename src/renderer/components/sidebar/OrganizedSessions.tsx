import { useState, type DragEvent } from 'react'
import { ChevronDown, ChevronRight, Ellipsis, Plus } from 'lucide-react'
import type { Project, SessionSummary } from '@shared/types'
import { isUnread, sectionFor } from '@shared/sessionOrganization'
import { useDesk } from '../../store'
import { useChat } from '../../chatStore'
import { useOrganization } from '../../organizationStore'
import { Menu } from '../ui/Menu'
import { Button, Dialog } from '../ui/Dialog'
import { IconButton, SessionRow } from './SessionRow'
const SESSION_DRAG = 'application/x-claude-session'
const SECTION_DRAG = 'application/x-claude-section'
export function dropSession(event: DragEvent, sectionId: string | null, before?: string) {
  const id = event.dataTransfer.getData(SESSION_DRAG)
  if (id) {
    event.preventDefault()
    event.stopPropagation()
    void useOrganization.getState().change({ kind: 'move', sessionId: id, sectionId, before })
  }
}
export function OrganizedSessionRow({
  session,
  project,
  showProject = false,
  pinned = false
}: {
  session: SessionSummary
  project: Project
  showProject?: boolean
  pinned?: boolean
}) {
  const { view, setView, renameSession, setArchived } = useDesk()
  const status = useChat((s) => {
    const chat = s.chats[session.id]
    return chat?.approvals.length ? 'awaiting' : chat?.state === 'awaiting' ? 'running' : chat?.state
  })
  const { value: org, change } = useOrganization()
  const section = sectionFor(org, session.id)
  const isPinned = org.pinned.includes(session.id)
  return (
    <div
      draggable={!session.archived}
      data-session-row={session.id}
      onDragStart={(e) => {
        e.dataTransfer.setData(SESSION_DRAG, session.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        if (!pinned) {
          dropSession(e, section?.id ?? null, session.id)
          return
        }
        const id = e.dataTransfer.getData(SESSION_DRAG)
        if (id) {
          e.preventDefault()
          e.stopPropagation()
          void change({ kind: 'pin', sessionId: id, pinned: true, before: session.id })
        }
      }}
    >
      <SessionRow
        session={session}
        indent={!showProject}
        active={view.kind === 'session' && view.sessionId === session.id}
        status={status}
        unread={isUnread(org, session.id)}
        subtitle={showProject ? project.name : undefined}
        onOpen={() => setView({ kind: 'session', sessionId: session.id, projectId: project.id })}
        onRename={(title) => void renameSession(session, project.id, title)}
        onArchive={(archived) => void setArchived(session, project.id, archived)}
        extra={
          !session.archived && (
            <div onClick={(e) => e.stopPropagation()}>
              <Menu
                align="right"
                width={210}
                trigger={({ toggle }) => (
                  <IconButton label={`整理会话 ${session.title}`} onClick={toggle}>
                    <Ellipsis size={13} />
                  </IconButton>
                )}
                items={[
                  {
                    key: 'pin',
                    label: isPinned ? '取消置顶' : '置顶',
                    onSelect: () => void change({ kind: 'pin', sessionId: session.id, pinned: !isPinned })
                  },
                  {
                    key: 'none',
                    label: '移回项目列表',
                    checked: !section,
                    separatorBefore: true,
                    onSelect: () => void change({ kind: 'move', sessionId: session.id, sectionId: null })
                  },
                  ...org.sections.map((s) => ({
                    key: s.id,
                    label: `移至 ${s.title}`,
                    checked: s.id === section?.id,
                    onSelect: () => void change({ kind: 'move', sessionId: session.id, sectionId: s.id })
                  }))
                ]}
              />
            </div>
          )
        }
      />
    </div>
  )
}
export function OrganizedGroups() {
  const { projects, sessions } = useDesk()
  const { value: org, change, error } = useOrganization()
  const [edit, setEdit] = useState<{ id?: string; title: string } | null>(null)
  const [title, setTitle] = useState('')
  const all = projects.flatMap((project) =>
    (sessions[project.id] ?? []).filter((session) => !session.archived).map((session) => ({ session, project }))
  )
  const rows = (ids: string[], pinned = false) =>
    ids.flatMap((id) => {
      const found = all.find((x) => x.session.id === id)
      return found && (pinned || !org.pinned.includes(id))
        ? [<OrganizedSessionRow key={id} {...found} showProject pinned={pinned} />]
        : []
    })
  const beginEdit = (value: { id?: string; title: string }) => {
    setEdit(value)
    setTitle(value.title)
  }
  const saveSection = async () => {
    if (!edit || !title.trim()) return
    await change(edit.id ? { kind: 'rename', id: edit.id, title } : { kind: 'create', id: crypto.randomUUID(), title })
    if (!useOrganization.getState().error) setEdit((current) => (current === edit ? null : current))
  }
  return (
    <>
      {error && (
        <p role="alert" className="px-2 py-1 text-xs text-danger">
          {error}
        </p>
      )}
      {org.pinned.some((id) => all.some((x) => x.session.id === id)) && (
        <section
          aria-label="置顶"
          className="mb-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(SESSION_DRAG)
            if (id) {
              e.preventDefault()
              void change({ kind: 'pin', sessionId: id, pinned: true })
            }
          }}
        >
          <h2 className="px-2 py-1 text-xs text-fg3">置顶</h2>
          {rows(org.pinned, true)}
        </section>
      )}
      <div className="flex items-center justify-between px-2 py-1 text-xs text-fg3">
        <span>分区</span>
        <IconButton label="新建分区" onClick={() => beginEdit({ title: '' })}>
          <Plus size={14} />
        </IconButton>
      </div>
      {org.sections.map((section, index) => (
        <section
          key={section.id}
          aria-label={`分区 ${section.title}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(SECTION_DRAG)
            if (id) {
              e.preventDefault()
              void change({ kind: 'reorder', id, before: section.id })
            } else dropSession(e, section.id)
          }}
        >
          <div
            className="flex h-8 items-center gap-1 px-1"
            draggable
            onDragStart={(e) => e.dataTransfer.setData(SECTION_DRAG, section.id)}
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-1 text-left text-[13px]"
              aria-expanded={!section.collapsed}
              onClick={() => void change({ kind: 'collapse', id: section.id, collapsed: !section.collapsed })}
            >
              {section.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <span className="truncate">{section.title}</span>
            </button>
            <Menu
              align="right"
              width={160}
              trigger={({ toggle }) => (
                <IconButton label={`管理分区 ${section.title}`} onClick={toggle}>
                  <Ellipsis size={14} />
                </IconButton>
              )}
              items={[
                { key: 'rename', label: '重命名', onSelect: () => beginEdit(section) },
                ...(index > 0
                  ? [
                      {
                        key: 'up',
                        label: '上移',
                        onSelect: () =>
                          void change({ kind: 'reorder', id: section.id, before: org.sections[index - 1].id })
                      }
                    ]
                  : []),
                ...(index < org.sections.length - 1
                  ? [
                      {
                        key: 'down',
                        label: '下移',
                        onSelect: () =>
                          void change({ kind: 'reorder', id: section.id, before: org.sections[index + 2]?.id })
                      }
                    ]
                  : []),
                {
                  key: 'delete',
                  label: '删除分区（保留会话）',
                  onSelect: () => void change({ kind: 'remove', id: section.id })
                }
              ]}
            />
          </div>
          {!section.collapsed && rows(section.sessions)}
        </section>
      ))}
      {edit && (
        <Dialog
          title={edit.id ? '重命名分区' : '新建分区'}
          onClose={() => setEdit(null)}
          footer={
            <>
              <Button onClick={() => setEdit(null)}>取消</Button>
              <Button variant="primary" disabled={!title.trim()} onClick={() => void saveSection()}>
                保存
              </Button>
            </>
          }
        >
          <input
            autoFocus
            maxLength={100}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) void saveSection()
            }}
            aria-label="分区名称"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-2 h-9 w-full rounded-lg border border-line bg-bg px-3 outline-none"
          />
        </Dialog>
      )}
    </>
  )
}
