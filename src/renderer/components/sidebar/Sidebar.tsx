import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Folder,
  FolderOpen,
  FolderPlus,
  PanelLeft,
  Settings,
  Search,
  SquarePen,
  Trash2
} from 'lucide-react'
import type { Project, SessionSummary } from '@shared/types'
import { useDesk } from '../../store'
import { useChat } from '../../chatStore'
import { Menu } from '../ui/Menu'
import { Button, Dialog } from '../ui/Dialog'
import { IconButton, SessionRow } from './SessionRow'

const VISIBLE_SESSIONS = 5

export function Sidebar({ width }: { width: number }) {
  const { projects, sessions, view, demo, newChat, pickProject, setView, toggleSidebar, setSearchOpen } = useDesk()
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [removing, setRemoving] = useState<Project | null>(null)
  const removeProject = useDesk((s) => s.removeProject)

  const archived = projects.flatMap((p) => (sessions[p.id] ?? []).filter((s) => s.archived).map((s) => ({ s, p })))

  return (
    <aside style={{ width }} className="flex h-full shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="drag flex h-[52px] shrink-0 items-center justify-end px-3">
        <div className="no-drag">
          <IconButton label="收起侧栏" onClick={toggleSidebar}>
            <PanelLeft size={16} />
          </IconButton>
        </div>
      </div>

      <nav className="px-2">
        <NavItem
          icon={<SquarePen size={16} />}
          label="新对话"
          active={view.kind === 'new'}
          onClick={() => newChat()}
        />
        <NavItem icon={<Search size={16} />} label="搜索" hint="⌘K" active={false} onClick={() => setSearchOpen(true)} />
      </nav>

      <div className="mt-5 flex items-center justify-between px-4 pb-1">
        <span className="text-[12px] font-medium text-fg3">项目</span>
        <IconButton label="添加项目" onClick={pickProject}>
          <FolderPlus size={14} />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {projects.length === 0 ? (
          <button
            type="button"
            onClick={pickProject}
            className="mx-1 mt-1 flex w-[calc(100%-8px)] flex-col items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-5 text-fg2 hover:bg-hover"
          >
            <FolderPlus size={18} />
            <span>添加项目文件夹</span>
            <span className="text-[12px] text-fg3">每个项目对应一个文件夹</span>
          </button>
        ) : (
          projects.map((p, i) => (
            <ProjectGroup
              key={p.id}
              project={p}
              sessions={(sessions[p.id] ?? []).filter((s) => !s.archived)}
              menuOpen={demo?.openMenu === 'project' && i === 0}
              onRemove={() => setRemoving(p)}
            />
          ))
        )}

        {archived.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setArchivedOpen(!archivedOpen)}
              className="flex h-7 w-full items-center gap-1 rounded-lg px-2 text-[12px] text-fg3 hover:bg-hover"
            >
              {archivedOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              已归档（{archived.length}）
            </button>
            {archivedOpen && archived.map(({ s, p }) => <ArchivedRow key={s.id} session={s} project={p} />)}
          </div>
        )}
      </div>

      <div className="border-t border-line p-2">
        <NavItem
          icon={<Settings size={16} />}
          label="设置"
          active={view.kind === 'settings'}
          onClick={() => setView({ kind: 'settings' })}
        />
      </div>

      {removing && (
        <Dialog
          title={`从列表中移除「${removing.name}」？`}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Button onClick={() => setRemoving(null)}>取消</Button>
              <Button
                variant="danger"
                onClick={() => {
                  void removeProject(removing.id)
                  setRemoving(null)
                }}
              >
                移除
              </Button>
            </>
          }
        >
          仅从列表中移除，不会删除文件夹里的任何文件，也不会删除历史会话。之后可以重新添加。
        </Dialog>
      )}
    </aside>
  )
}

function NavItem({
  icon,
  label,
  hint,
  active,
  onClick
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  active: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] ${
        active ? 'bg-active text-fg' : 'text-fg hover:bg-hover'
      }`}
    >
      <span className="text-fg2">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {hint && <span className="text-[12px] text-fg3">{hint}</span>}
    </button>
  )
}

function ProjectGroup({
  project,
  sessions,
  menuOpen,
  onRemove
}: {
  project: Project
  sessions: SessionSummary[]
  menuOpen: boolean
  onRemove(): void
}) {
  const { view, newChat, toggleProject, setView, renameSession, setArchived } = useDesk()
  const [showAll, setShowAll] = useState(false)
  const chats = useChat((s) => s.chats)
  const visible = showAll ? sessions : sessions.slice(0, VISIBLE_SESSIONS)

  return (
    <div className="mt-0.5">
      <div
        role="button"
        tabIndex={0}
        onClick={() => toggleProject(project.id)}
        title={project.path}
        className="group flex h-8 items-center gap-2 rounded-lg pl-2.5 pr-1.5 hover:bg-hover"
      >
        <span className="text-fg2">
          {project.collapsed ? <Folder size={16} /> : <FolderOpen size={16} />}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
        <span className={`items-center gap-0.5 ${menuOpen ? 'flex' : 'hidden group-hover:flex'}`}>
          <IconButton label="在此项目中新建对话" onClick={() => newChat(project.id)}>
            <SquarePen size={13} />
          </IconButton>
          <div onClick={(e) => e.stopPropagation()}>
            <Menu
              align="right"
              width={200}
              defaultOpen={menuOpen}
              trigger={({ toggle }) => (
                <IconButton label="更多" onClick={toggle}>
                  <Ellipsis size={14} />
                </IconButton>
              )}
              items={[
                { key: 'new', label: '在此项目中新建对话', icon: <SquarePen size={14} />, onSelect: () => newChat(project.id) },
                {
                  key: 'reveal',
                  label: '在访达中显示',
                  icon: <FolderOpen size={14} />,
                  onSelect: () => void window.desk.projects.revealInFinder(project.path)
                },
                {
                  key: 'remove',
                  label: '从列表中移除',
                  icon: <Trash2 size={14} />,
                  danger: true,
                  separatorBefore: true,
                  onSelect: onRemove
                }
              ]}
            />
          </div>
        </span>
      </div>

      {!project.collapsed && (
        <div className="mt-0.5 flex flex-col gap-px">
          {sessions.length === 0 && <div className="py-1.5 pl-8 text-[12.5px] text-fg3">还没有对话</div>}
          {visible.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              active={view.kind === 'session' && view.sessionId === s.id}
              status={chats[s.id]?.state}
              onOpen={() => setView({ kind: 'session', sessionId: s.id, projectId: project.id })}
              onRename={(title) => void renameSession(s, project.id, title)}
              onArchive={(a) => void setArchived(s, project.id, a)}
            />
          ))}
          {sessions.length > VISIBLE_SESSIONS && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="h-7 rounded-lg pl-8 text-left text-[12.5px] text-fg3 hover:bg-hover hover:text-fg2"
            >
              {showAll ? '收起' : `显示全部（${sessions.length}）`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ArchivedRow({ session, project }: { session: SessionSummary; project: Project }) {
  const { view, setView, renameSession, setArchived } = useDesk()
  return (
    <SessionRow
      session={session}
      indent={false}
      active={view.kind === 'session' && view.sessionId === session.id}
      onOpen={() => setView({ kind: 'session', sessionId: session.id, projectId: project.id })}
      onRename={(title) => void renameSession(session, project.id, title)}
      onArchive={(a) => void setArchived(session, project.id, a)}
    />
  )
}
