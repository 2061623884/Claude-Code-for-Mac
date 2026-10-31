import { useEffect, useRef } from 'react'
import { PanelLeft, SquarePen } from 'lucide-react'
import { useDesk } from './store'
import { useChat } from './chatStore'
import { usePanel } from './panelStore'
import { LEFT, useLayout } from './layoutStore'
import { notifyIfAway } from './notify'
import { Sidebar } from './components/sidebar/Sidebar'
import { IconButton } from './components/sidebar/SessionRow'
import { NewSessionPage } from './components/newSession/NewSessionPage'
import { SettingsPage } from './components/settings/SettingsPage'
import { ChatView } from './components/chat/ChatView'
import { RightPanel, RightPanelToggle } from './components/right/RightPanel'
import { ResizeHandle } from './components/ui/ResizeHandle'
import { AddProjectDialog } from './components/dialogs/AddProjectDialog'
import { ImportHistoryDialog } from './components/dialogs/ImportHistoryDialog'
import { SearchDialog } from './components/dialogs/SearchDialog'
import { SessionSummary } from './components/summary/SessionSummary'

export function App() {
  const { ready, view, sessions, sidebarCollapsed, pendingProjectPath, importCandidates, searchOpen, init, toggleSidebar, newChat, refreshSessions, setSearchOpen } =
    useDesk()

  useEffect(() => {
    void init()
  }, [init])

  useEffect(
    () =>
      window.desk.chat.onEvent((sessionId, event) => {
        useChat.getState().handle(sessionId, event)
        notifyIfAway(sessionId, event)
      }),
    []
  )

  // 开发截图用：自动打开会话或自动发送消息（等会话列表加载后执行一次）
  const demoDone = useRef(false)
  useEffect(() => {
    const { demo, projects, sessions: all, setView, setDraft } = useDesk.getState()
    const first = projects[0]
    if (!ready || !demo || demoDone.current || (first && !all[first.id])) return
    demoDone.current = true
    if (first && demo.openSession !== undefined) {
      const s = all[first.id]?.[demo.openSession]
      if (s) setView({ kind: 'session', sessionId: s.id, projectId: first.id })
    }
    if (demo.prompt) {
      if (demo.model) setDraft({ model: demo.model })
      void useChat.getState().start(demo.prompt)
    }
  }, [ready, sessions])

  // 切换页面时收起命令浮层
  useEffect(() => usePanel.getState().close(), [view])

  // ⌘K 搜索会话；⌘B 左栏、⌘⇧B 右栏
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.metaKey) return
      const key = e.key.toLowerCase()
      if (key === 'k') {
        e.preventDefault()
        setSearchOpen(!useDesk.getState().searchOpen)
      } else if (key === 'b' && e.shiftKey) {
        e.preventDefault()
        const layout = useLayout.getState()
        layout.setRightOpen(!layout.rightOpen)
      } else if (key === 'b') {
        e.preventDefault()
        useDesk.getState().toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSearchOpen])

  // 回到窗口时刷新会话列表（可能在终端或 VS Code 里有新对话）
  useEffect(() => {
    const onFocus = (): void => void refreshSessions()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshSessions])

  const { leftWidth, resizing, setLeftWidth, rightOpen, expanded } = useLayout()

  if (!ready) return <div className="drag h-full" />

  const title = view.kind === 'session' ? sessions[view.projectId]?.find((s) => s.id === view.sessionId)?.title : undefined

  return (
    <div className="flex h-full">
      {/* 侧栏收起/展开：宽度和透明度过渡，内容宽度固定只做裁切，避免文字挤压换行；拖动右边缘调宽 */}
      <div
        inert={sidebarCollapsed}
        style={{ width: sidebarCollapsed ? 0 : leftWidth }}
        className={`relative shrink-0 ${
          resizing ? '' : 'transition-[width,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none'
        } ${sidebarCollapsed ? 'opacity-0' : 'opacity-100'}`}
      >
        <div className="h-full overflow-hidden">
          <Sidebar width={leftWidth} />
        </div>
        {!sidebarCollapsed && <ResizeHandle side="left" width={leftWidth} defaultWidth={LEFT.default} onResize={setLeftWidth} />}
      </div>
      <main inert={rightOpen && expanded && view.kind !== 'settings'} className={`flex min-w-0 flex-1 flex-col bg-bg ${rightOpen && expanded ? 'overflow-hidden' : ''}`}>
        <div className="drag relative z-40 flex h-[52px] shrink-0 items-center gap-1 pl-[84px]">
          {sidebarCollapsed && (
            <div className="no-drag animate-fade-in flex gap-1">
              <IconButton label="展开侧栏" onClick={toggleSidebar}>
                <PanelLeft size={16} />
              </IconButton>
              <IconButton label="新对话" onClick={() => newChat()}>
                <SquarePen size={15} />
              </IconButton>
            </div>
          )}
          {title && <span className="min-w-0 flex-1 truncate pr-6 text-[13.5px] font-medium">{title}</span>}
          {view.kind !== 'settings' && (
            <div className="ml-auto flex items-center gap-3 pr-3">
              {view.kind === 'session' && <SessionSummary sessionId={view.sessionId} projectId={view.projectId} />}
              <RightPanelToggle />
            </div>
          )}
        </div>
        {view.kind === 'new' && <NewSessionPage />}
        {view.kind === 'settings' && <SettingsPage />}
        {view.kind === 'session' && <ChatView key={view.sessionId} sessionId={view.sessionId} projectId={view.projectId} />}
      </main>
      {view.kind !== 'settings' && <RightPanel sessionId={view.kind === 'session' ? view.sessionId : undefined} projectId={view.kind === 'session' ? view.projectId : useDesk.getState().selectedProjectId ?? undefined} />}
      {pendingProjectPath && <AddProjectDialog path={pendingProjectPath} />}
      {importCandidates && <ImportHistoryDialog candidates={importCandidates} />}
      {searchOpen && <SearchDialog />}
    </div>
  )
}
