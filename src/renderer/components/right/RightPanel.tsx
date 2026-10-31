import { useEffect, useState } from 'react'
import { Compass, FileText, FolderOpen, Globe, Maximize2, MessageCircleQuestion, Minimize2, PanelRight, Plus, Terminal, X } from 'lucide-react'
import { fileName } from '@shared/fileLinks'
import { FilePreview } from '../files/FilePreview'
import { useChat } from '../../chatStore'
import { RIGHT, useLayout, type SidePage } from '../../layoutStore'
import { useDesk } from '../../store'
import { useModal } from '../../modalStore'
import { IconButton } from '../sidebar/SessionRow'
import { ResizeHandle } from '../ui/ResizeHandle'
import { BtwPane } from './BtwPane'
import { ProjectFilesPane } from './ProjectFilesPane'
import { FileContext } from '../files/FileLink'
import { StartPane } from './StartPane'
import { TerminalPane } from './TerminalPane'
import { BrowserPane } from './BrowserPane'

const LABELS = { start: '开始', files: '工作区文件', terminal: '终端', browser: '浏览器' }
const ICONS = { start: Compass, files: FolderOpen, terminal: Terminal, browser: Globe }

export function RightPanel({ sessionId, projectId }: { sessionId?: string; projectId?: string }) {
  const layout = useLayout()
  const { rightOpen, rightTab, openFiles, pages, expanded } = layout
  const leftShown = useDesk((s) => !s.sidebarCollapsed)
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  useEffect(() => {
    const resize = (): void => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  const available = windowWidth - (leftShown ? layout.leftWidth : 0)
  const rightWidth = expanded ? available : Math.max(RIGHT.min, Math.min(layout.rightWidth, available - 420))
  const cwd = useDesk((s) => s.projects.find((p) => p.id === projectId)?.path)
  const options = useChat((s) => sessionId ? s.chats[sessionId]?.options : undefined)
  const modalOpen = useModal((s) => s.count > 0)
  const current = openFiles.find((f) => `file:${f.path}` === rightTab)
  const choose = (page: SidePage, kind: SidePage['kind']): void => layout.changePage(page.id, kind, page.cwd ?? cwd)

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.isComposing || e.defaultPrevented || modalOpen) return
      const kind = e.metaKey && e.key.toLowerCase() === 'p' ? 'files'
        : e.metaKey && e.key.toLowerCase() === 't' ? 'browser'
        : e.ctrlKey && e.code === 'Backquote' ? 'terminal' : null
      if (!kind || (!cwd && kind !== 'browser')) return
      e.preventDefault()
      const state = useLayout.getState()
      const page = state.pages.find((p) => p.id === state.rightTab)
      if (page?.kind === 'start') { state.changePage(page.id, kind, cwd); state.setRightOpen(true) }
      else state.newPage(cwd, kind)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [cwd, modalOpen])

  useEffect(() => window.desk.workspace.onShortcut((kind) => {
    if (!modalOpen && (cwd || kind === 'browser')) useLayout.getState().newPage(cwd, kind)
  }), [cwd, modalOpen])

  const tabs = [
    ...(sessionId ? [{ id: 'btw' as const, label: '顺便问一下', icon: MessageCircleQuestion }] : []),
    ...(rightTab === 'project' ? [{ id: 'project' as const, label: '工作区文件', icon: FolderOpen }] : []),
    ...pages.map((p) => ({ id: p.id, label: LABELS[p.kind], icon: ICONS[p.kind], close: () => layout.closePage(p.id) })),
    ...openFiles.map((f) => ({ id: `file:${f.path}` as const, label: fileName(f.path), icon: FileText, close: () => layout.closeFile(f.path), title: f.path }))
  ]

  return (
    <div inert={!rightOpen} style={{ width: rightOpen ? rightWidth : 0 }} className={`relative shrink-0 ${rightOpen ? '' : 'overflow-hidden opacity-0'}`}>
      <aside style={{ width: rightWidth }} aria-label="工作区侧栏" className="flex h-full flex-col border-l border-line bg-bg">
        <div className="drag flex h-[52px] shrink-0 items-center gap-1 px-2">
          <div role="tablist" aria-label="侧栏页面" className="no-drag flex min-w-0 flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none]">
            {tabs.map((tab) => {
              const active = tab.id === rightTab
              const close = 'close' in tab ? tab.close : undefined
              return (
                <div key={tab.id} className={`group flex h-8 max-w-[180px] shrink-0 items-center rounded-lg ${active ? 'bg-active' : 'hover:bg-hover'}`}>
                  <button type="button" role="tab" aria-selected={active} title={'title' in tab ? tab.title : tab.label}
                    ref={active ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) : undefined}
                    onClick={() => layout.openRight(tab.id)} onMouseDown={(e) => { if (e.button === 1 && close) { e.preventDefault(); close() } }}
                    className={`flex min-w-0 items-center gap-1.5 px-2 py-1.5 text-[12px] ${active ? 'font-medium' : 'text-fg2'}`}>
                    <tab.icon size={14} className="shrink-0" /><span className="truncate">{tab.label}</span>
                  </button>
                  {close && <button type="button" aria-label={`关闭${tab.label}`} onClick={close} className="mr-1 rounded p-0.5 text-fg3 hover:bg-active hover:text-fg"><X size={12} /></button>}
                </div>
              )
            })}
          </div>
          <div className="no-drag flex">
            <IconButton label="新建侧栏页面" onClick={() => layout.newPage(cwd)}><Plus size={16} /></IconButton>
            <IconButton label={expanded ? '还原侧栏宽度' : '展开侧栏页面'} onClick={() => layout.setExpanded(!expanded)}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</IconButton>
            <IconButton label="收起右栏（⌘⇧B）" onClick={() => layout.setRightOpen(false)}><PanelRight size={16} /></IconButton>
          </div>
        </div>
        <FileContext.Provider value={{ cwd }}>
          <div className="relative min-h-0 flex-1">
            {current && <FilePreview key={current.path} path={current.path} line={current.line} nonce={current.nonce} cwd={cwd} />}
            {rightTab === 'btw' && (sessionId && options ? <BtwPane key={sessionId} sessionId={sessionId} cwd={cwd} options={options} active={rightOpen} /> : <div className="p-5 text-fg3">开始对话后可使用“顺便问一下”。</div>)}
            {rightTab === 'project' && <ProjectFilesPane cwd={cwd} refreshKey={0} />}
            {pages.map((page) => {
              const active = page.id === rightTab && rightOpen
              return (
                <div key={page.id} hidden={page.id !== rightTab} className={page.id === rightTab ? 'h-full' : 'hidden'}>
                  {page.kind === 'start' && <StartPane hasProject={Boolean(page.cwd ?? cwd)} onSelect={(kind) => choose(page, kind)} />}
                  {page.kind === 'files' && <ProjectFilesPane cwd={page.cwd ?? cwd} refreshKey={0} />}
                  {page.kind === 'terminal' && <TerminalPane id={page.id} cwd={page.cwd ?? cwd} active={active} />}
                  {page.kind === 'browser' && <BrowserPane id={page.id} active={active && !modalOpen} />}
                </div>
              )
            })}
          </div>
        </FileContext.Provider>
      </aside>
      {rightOpen && !expanded && <ResizeHandle side="right" width={rightWidth} defaultWidth={RIGHT.default} onResize={layout.setRightWidth} />}
    </div>
  )
}

export function RightPanelToggle() {
  const { rightOpen, setRightOpen } = useLayout()
  if (rightOpen) return null
  return <div className="no-drag"><IconButton label="展开右栏（⌘⇧B）" onClick={() => setRightOpen(true)}><PanelRight size={16} /></IconButton></div>
}
