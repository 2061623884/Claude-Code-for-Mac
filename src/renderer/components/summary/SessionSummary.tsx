import { SessionArtifacts } from '../artifacts/ArtifactLibrary'
import { TaskOutputView } from './TaskActions'
import { SessionInfo } from './SessionInfo'
import type { SummaryItem } from '@shared/sessionSummary'
import { useEffect, useRef, useState } from 'react'
import { ChevronRight, ListFilter, ListTree } from 'lucide-react'
import { emptySessionSummary, SUMMARY_LABELS, SUMMARY_SECTIONS, type SummaryView } from '@shared/sessionSummary'
import { useChat } from '../../chatStore'
import { useDesk } from '../../store'
import { useSummaryUi } from '../../summaryUiStore'
import { useLayout } from '../../layoutStore'
import { ChangeCounts, SUMMARY_ICONS, SummaryRows } from './SummaryContent'

const EMPTY = emptySessionSummary()
export function SessionSummary({ sessionId, projectId }: { sessionId: string; projectId: string }) {
  const expanded = useSummaryUi((s) => s.expanded[sessionId])
  const opened = useSummaryUi((s) => s.opened[sessionId] ?? false)
  const summary = useChat((s) => s.chats[sessionId]?.summary ?? EMPTY)
  const project = useDesk((s) => s.projects.find((p) => p.id === projectId))
  const visibleSections = SUMMARY_SECTIONS.filter((section) => summary.sections[section].length > 0)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!opened) return
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.defaultPrevented && box.current?.contains(document.activeElement)) {
        e.preventDefault(); useSummaryUi.getState().toggle(sessionId)
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [opened, sessionId])
  return <div ref={box} className="no-drag relative">
    <button type="button" aria-label="切换摘要面板状态" title="会话摘要" aria-expanded={opened} onClick={() => useSummaryUi.getState().toggle(sessionId)}
      className={`flex size-8 items-center justify-center rounded-xl transition-colors ${opened ? 'bg-active text-fg' : 'text-fg2 hover:bg-hover'}`}><ListTree size={19} /></button>
    {opened && <section aria-label="会话摘要" className="absolute right-0 top-full z-40 mt-3 max-h-[calc(100vh-100px)] w-[340px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-2xl border border-line-strong bg-card p-5 shadow-pop animate-pop-in [transform-origin:top_right]">
      <h2 className="mb-3 truncate text-[14px] font-medium text-fg2" title={project?.path}>{project?.name ?? '当前会话'}</h2>
      <div className="border-t border-line py-2">
        {visibleSections.length === 0 && <p className="px-1 py-2 text-[12px] text-fg3">暂无活动记录</p>}
        {visibleSections.map((section) => {
          const Icon = SUMMARY_ICONS[section]
          const items = summary.sections[section]
          const isExpanded = expanded?.[section] ?? false
          return <div key={section}>
            <button type="button" aria-label={`${SUMMARY_LABELS[section]}分类`} aria-expanded={isExpanded}
              onClick={() => useSummaryUi.getState().toggleSection(sessionId, section)}
              className="flex min-h-10 w-full items-center gap-2 rounded-lg px-1 text-left text-[13px] text-fg2 hover:bg-hover">
              <Icon size={16} className="shrink-0" />
              <span>{SUMMARY_LABELS[section]} · {items.length}</span>
              <ChevronRight size={14} className={`shrink-0 transition-transform motion-reduce:transition-none ${isExpanded ? 'rotate-90' : ''}`} />
              <span className="ml-auto">{section === 'changes' && <ChangeCounts items={items} />}</span>
            </button>
            {isExpanded && <div className="pb-2 pl-5">
              <SummaryRows section={section} items={items.slice(0, 3)} compact onOutput={item => { useSummaryUi.getState().requestTask(sessionId, item.id); useLayout.getState().openSummary(sessionId, projectId, 'all') }} />
              {items.length > 3 && <p className="px-1 pt-1 text-[11px] text-fg3">还有 {items.length - 3} 项</p>}
            </div>}
          </div>
        })}
      </div>
      <div className="sticky bottom-0 border-t border-line bg-card pt-2">
        <button type="button" onClick={() => useLayout.getState().openSummary(sessionId, projectId, 'all')} aria-label="查看全部" className="flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left text-[12px] text-fg2 hover:bg-hover"><ListFilter size={15} />查看全部</button>
      </div>
    </section>}
  </div>
}

export function SummaryDetail({ sessionId, projectId, section }: { sessionId: string; projectId: string; section: SummaryView }) {
  const chat = useChat((s) => s.chats[sessionId])
  const project = useDesk((s) => s.projects.find((p) => p.id === projectId))
  const title = useDesk((s) => s.sessions[projectId]?.find((item) => item.id === sessionId)?.title)
  const taskRequest = useSummaryUi(s => s.taskRequest[sessionId])
  const [output, setOutput] = useState<SummaryItem | null>(null)
  const [visible, setVisible] = useState(!document.hidden)
  useEffect(() => { const update = () => setVisible(!document.hidden); document.addEventListener('visibilitychange', update); return () => document.removeEventListener('visibilitychange', update) }, [])
  const pageActive = useLayout(s => s.rightOpen && s.pages.some(p => p.id === s.rightTab && p.kind === 'summary' && p.section === section && p.sessionId === sessionId))
  const active = pageActive && visible
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { let stale = false; void useChat.getState().load(sessionId, projectId).catch((e: Error) => { if (!stale) setError(e.message) }); return () => { stale = true } }, [sessionId, projectId])
  const summary = chat?.summary ?? EMPTY
  const sections = section === 'all' ? SUMMARY_SECTIONS.filter((category) => summary.sections[category].length > 0) : [section]
  const records = [...summary.sections.tasks, ...summary.sections.agents]
  const selectedTask = output ? records.find(item => item.id === output.id) ?? records.find(item => output.execution?.taskId && item.execution?.taskId === output.execution.taskId && item.execution?.runId === output.execution.runId) ?? { ...output, execution: output.execution ? { ...output.execution, canStop: false } : undefined } : null
  useEffect(() => {
    if (section !== 'all' || !active || !taskRequest) return
    const item = [...summary.sections.tasks, ...summary.sections.agents].find(item => item.id === taskRequest)
    if (item) { setOutput(item); useSummaryUi.getState().requestTask(sessionId, null) }
  }, [taskRequest, section, active, sessionId, summary])
  const label = section === 'all' ? '会话摘要' : SUMMARY_LABELS[section]
  return <section aria-label={`${label}详情`} className="flex h-full flex-col">
    <div className="shrink-0 border-b border-line px-5 py-3"><h2 className="text-[15px] font-medium">{label}</h2><p className="mt-1 truncate text-[11px] text-fg3" title={title}>{project?.name ?? '项目已移除'} · {title || sessionId.slice(0, 8)}</p></div>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
      {selectedTask && project ? <TaskOutputView key={selectedTask.id} item={selectedTask} sessionId={sessionId} cwd={project.path} active={active} onBack={() => setOutput(null)} /> : <>
      {section === 'all' && project && <><SessionInfo sessionId={sessionId} cwd={project.path} active={active} /><SessionArtifacts sessionId={sessionId} cwd={project.path} active={active} /></>}
      {error ? <p role="alert" className="py-4 text-danger">{error}</p> : !chat?.loaded ? <p className="py-4 text-fg3">正在读取会话摘要…</p> : sections.length === 0 ? <p className="py-4 text-[12px] text-fg3">暂无活动记录</p> : sections.map((category) => {
        const Icon = SUMMARY_ICONS[category]
        return <section key={category} aria-label={`${SUMMARY_LABELS[category]}完整列表`} className="border-b border-line py-4 last:border-0">
          <h3 className="flex items-center gap-2 text-[13px] font-medium"><Icon size={16} />{SUMMARY_LABELS[category]} <span className="text-fg3">{summary.sections[category].length}</span></h3>
          <SummaryRows section={category} items={summary.sections[category]} sessionId={sessionId} onOutput={setOutput} />
        </section>
      })}
      {(section === 'changes' || (section === 'all' && summary.sections.changes.length > 0)) && <p className="mt-4 text-[11px] text-fg3">仅汇总已确认成功的文件工具操作，行数为操作累计。无法确认的差异显示未知；通过终端或外部程序产生的改动可能不包含在内。</p>}
      {summary.historyIncomplete && <p className="mt-4 text-[11px] text-fg3">此会话历史记录不完整，部分来源、任务或子 Agent 状态可能未保存。</p>}
      </>}
    </div>
  </section>
}
