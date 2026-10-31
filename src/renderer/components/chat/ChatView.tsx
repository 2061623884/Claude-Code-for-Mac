import { Fragment, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { ComposerAttachment } from '@shared/attachments'
import type { UiBlock, UiMessage } from '@shared/chat'
import type { CommandInfo } from '@shared/types'
import { turnsOf } from '@shared/fileChanges'
import { sumUsage, totalTokens } from '@shared/usageStats'
import { useBtw } from '../../btwStore'
import { useSessionMarks } from '../../sessionMarks'
import { useChat, useChatActions } from '../../chatStore'
import { useLayout } from '../../layoutStore'
import { openAppPanel, usePanel } from '../../panelStore'
import { useDesk } from '../../store'
import { CommandPanel, type PanelContext } from '../commands/CommandPanel'
import { useCommandAutoOpen } from '../commands/useCommandAutoOpen'
import { FileContext } from '../files/FileLink'
import { Composer, EffortChip, ModelChip, PermissionChip } from '../newSession/Composer'
import { ApprovalCard } from './ApprovalCard'
import { CommandRecord } from './CommandRecord'
import { ContextMeter } from './ContextMeter'
import { useContextUsage } from '../../hooks/useContextUsage'
import { Markdown } from './Markdown'
import { ToolCard } from './ToolCard'
import { TurnFiles } from './TurnFiles'
import { AssistantActions } from './MessageActions'
import { UserMessage } from './UserMessage'
import { MessageQueue } from './MessageQueue'
import { ActivityIndicator } from '../ui/ActivityIndicator'
import { activityLabel, ThinkingSummary } from './ThinkingSummary'
import { useComposerDrafts, EMPTY_DRAFT } from '../../composerDraftStore'
import { UsagePill } from './UsageStats'

// SDK 里没有 /btw，由应用自己实现，补进命令菜单
const EXTRA_COMMANDS: CommandInfo[] = [
  { name: 'btw', description: '顺便问一下：在右侧提问，不打断也不写入当前对话', argumentHint: '<问题>' }
]

export function ChatView({ sessionId, projectId }: { sessionId: string; projectId: string }) {
  const chat = useChat((s) => s.chats[sessionId])
  const { load, reload, send, edit, interrupt, setOptions, respond, queueAction } = useChatActions()
  const cwd = useDesk((s) => s.projects.find((p) => p.id === projectId)?.path)
  const normalDraft = useComposerDrafts(s => s.drafts[sessionId] ?? EMPTY_DRAFT)
  const editing = useComposerDrafts(s => s.edits[sessionId])
  const [editBusy, setEditBusy] = useState(false)
  const { text, attachments } = editing ?? normalDraft
  const setText = (text: string): void => {
    const store = useComposerDrafts.getState()
    if (editing) store.updateEdit(sessionId, { text }); else store.updateDraft(sessionId, { text })
  }
  const setAttachments = (attachments: ComposerAttachment[]): void => {
    const store = useComposerDrafts.getState()
    if (editing) store.updateEdit(sessionId, { attachments }); else store.updateDraft(sessionId, { attachments })
  }
  const [sendError, setSendError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    void load(sessionId, projectId)
    stick.current = true
  }, [load, sessionId, projectId])

  const unread = useSessionMarks((s) => !!s.unread[sessionId])
  const sidebarExpanded = useLayout((s) => s.rightOpen && s.expanded)
  useEffect(() => {
    const markViewed = (): void => {
      if (chat?.loaded && !sidebarExpanded && document.visibilityState === 'visible' && document.hasFocus()) {
        useSessionMarks.getState().markRead(sessionId)
      }
    }
    markViewed()
    window.addEventListener('focus', markViewed)
    document.addEventListener('visibilitychange', markViewed)
    return () => {
      window.removeEventListener('focus', markViewed)
      document.removeEventListener('visibilitychange', markViewed)
    }
  }, [sessionId, chat?.loaded, unread, sidebarExpanded])

  // 回到窗口时检查这个会话是否在终端或 VS Code 里被续写了
  const [external, setExternal] = useState(false)
  const idle = chat?.loaded && chat.state === 'idle'
  useEffect(() => {
    if (!idle || !cwd) return
    const check = (): void => {
      window.desk.chat.checkExternal(sessionId, cwd).then(setExternal, () => {})
    }
    check()
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [idle, cwd, sessionId])

  const model = chat?.options.model ?? null
  const context = useContextUsage(sessionId, cwd, model, chat?.loaded ?? false, idle)

  useCommandAutoOpen(chat?.messages, chat?.loaded)
  const panelOpen = usePanel((s) => s.panel !== null)

  // 停在底部时，新内容到来自动滚动；用户往上翻时不打扰
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [chat?.messages, chat?.approvals.length, chat?.state])

  if (!chat) return <div className="flex-1" />

  const running = chat.state === 'running' || chat.state === 'awaiting'
  const hasWaiting = Boolean(chat.queue?.items.some(item => item.editing || ['queued', 'failed'].includes(item.status)))
  // 本地命令在对话里只留一行记录：隐藏紧挨着它的那条用户输入
  const hidden = new Set(
    chat.messages.filter((m, i) => m.role === 'user' && chat.messages[i + 1]?.blocks[0]?.kind === 'command').map((m) => m.id)
  )
  const turns = turnsOf(chat.messages)
  const sessionUsage = sumUsage(chat.messages)
  const approval = chat.approvals[0]
  const liveIndicator = running ? <ActivityIndicator iconOnly label={activityLabel(chat.state, chat.activity)} active={chat.state === 'running' && chat.activity?.phase !== 'stopping'} /> : null
  const anchorExists = chat.messages.some(m => m.id === chat.activity?.messageId && !m.parentToolUseId && m.role === 'assistant' && m.blocks[chat.activity.blockIndex ?? -1])
  const renderMessage = (message: UiMessage) => (
    <Message
      key={message.id}
      message={message}
      indicator={anchorExists && message.id === chat.activity?.messageId ? liveIndicator : null}
      activeBlock={chat.activity?.blockIndex}
      running={running}
      cwd={cwd}
      // 编辑历史消息：会话空闲时才能改
      onEdit={running || approval || message.forkFrom === undefined ? undefined : (text) => edit(sessionId, message.id, text)}
    />
  )
  // 命令卡片里的选项（切换模型等）：会话空闲时才能点
  const runCommand = chat.loaded && !running && !approval ? (command: string) => void send(sessionId, command) : undefined
  const panelCtx: PanelContext = {
    sessionId,
    cwd,
    options: chat.options,
    setOptions: (patch) => void setOptions(sessionId, patch).catch(() => {}),
    onRun: runCommand,
    sessionUsage
  }

  return (
    <FileContext.Provider value={{ cwd }}>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
            }}
            className="min-h-0 flex-1 overflow-y-auto px-8"
          >
            <div className="mx-auto max-w-[760px] pt-2 pb-6">
              {external && (
                <div className="sticky top-0 z-10 mb-2 flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-2.5 text-[13px] shadow-card">
                  <span className="min-w-0 flex-1 text-fg2">这个会话在其他地方（终端或 VS Code）有了新内容</span>
                  <button
                    type="button"
                    onClick={() => {
                      setExternal(false)
                      stick.current = true
                      void reload(sessionId)
                    }}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium hover:bg-hover"
                  >
                    <RefreshCw size={13} />
                    载入最新内容
                  </button>
                </div>
              )}
              {!chat.loaded && <div className="py-10 text-center text-fg3">正在加载对话…</div>}
              {turns.map((turn, i) => (
                <Fragment key={turn[0]!.id}>
                  {turn
                    .filter((m) => m.role === 'user' && !m.parentToolUseId && !hidden.has(m.id))
                    .map(renderMessage)}
                  <ThinkingSummary showActivity={false} messages={turn} state={(anchorExists ? turn.some(m => m.id === chat.activity?.messageId) : i === turns.length - 1) ? chat.state : 'idle'} activity={(anchorExists ? turn.some(m => m.id === chat.activity?.messageId) : i === turns.length - 1) ? chat.activity : undefined} />
                  {turn
                    .filter((m) => m.role !== 'user' && !m.parentToolUseId && !hidden.has(m.id))
                    .map(renderMessage)}
                  {/* 每轮结束后列出这一轮改过的文件，点开在右栏看对比 */}
                  {!(running && (anchorExists ? turn.some(m => m.id === chat.activity?.messageId) : i === turns.length - 1)) && (
                    <>
                      <TurnFiles messages={turn} cwd={cwd} />
                      <AssistantActions turn={turn} />
                    </>
                  )}
                </Fragment>
              ))}
              {!anchorExists && liveIndicator}
              {chat.error && (
                <div className="my-3 rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-[13px] text-danger select-text">
                  {chat.error}
                </div>
              )}
            </div>
          </div>

          <div className="px-8 pb-5">
            <div className="mx-auto max-w-[760px] space-y-2">
              {approval && (
                <ApprovalCard
                  key={approval.requestId}
                  request={approval}
                  total={chat.approvals.length}
                  cwd={cwd}
                  onDecide={(d) => void respond(sessionId, approval.requestId, d).catch(() => {})}
                />
              )}
              {chat.optionsSaved === false && <div className="text-[11px] text-fg3">此旧会话没有已保存配置；当前选择将用于下次执行。</div>}
              <MessageQueue key={`queue-${sessionId}`} queue={chat.queue} canInsert={chat.state === 'running' && chat.activity?.phase !== 'stopping' && !approval} onAction={action => queueAction(sessionId, action)} editingId={editing?.id} onEdit={async item => {
                await queueAction(sessionId, { type: 'beginEdit', id: item.id })
                useComposerDrafts.getState().beginEdit(sessionId, item)
                setSendError(null)
              }} />
              <Composer
                key={`${sessionId}:${editing?.id ?? 'draft'}`}
                clearOnSubmit={!editing}
                submitLabel={editing ? '保存到队列' : undefined}
                header={editing && <div className="flex items-center justify-between gap-3 px-3 pt-3 text-[12px] text-fg3"><span>正在编辑排队消息 · 保留原排队位置</span><button type="button" disabled={editBusy} className="hover:text-fg disabled:opacity-40" onClick={async () => {
                  setEditBusy(true); setSendError(null)
                  try { await queueAction(sessionId, { type: 'cancelEdit', id: editing.id }); useComposerDrafts.getState().finishEdit(sessionId) }
                  catch (e) { setSendError(e instanceof Error ? e.message : String(e)) }
                  finally { setEditBusy(false) }
                }}>取消编辑</button></div>}
                history={editing ? [] : chat.messages.filter(m => m.source === 'human' && !m.parentToolUseId).map(m => ({ id: m.id, text: blockText(m.blocks) }))}
                value={text}
                onChange={setText}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
                rows={2}
                autoFocus
                cwd={cwd}
                placeholder={editing ? '编辑这条排队消息…' : approval ? '处理上方请求后继续' : running ? '输入下一条任务，发送后加入队列' : '回复 Claude…'}
                running={running && !editing}
                onStop={() => void interrupt(sessionId)}
                canSubmit={Boolean(chat.loaded && (editing || !approval) && !editBusy)}
                submitHint={editing ? '保存到队列（Enter）' : running || hasWaiting ? '加入队列（Enter）' : '发送（Enter）'}
                extraCommands={EXTRA_COMMANDS}
                panel={!editing && panelOpen && <CommandPanel ctx={panelCtx} />}
                onCommand={editing ? undefined : (name, args) => {
                  if (name === 'btw') {
                    const pageId = useLayout.getState().newPage(cwd, 'chat')
                    if (pageId && args && cwd) void useBtw.getState().ask(pageId, sessionId, cwd, args, chat.options)
                    return true
                  }
                  return openAppPanel(name, args)
                }}
                onSubmit={async ({ prompt, attachments: files }) => {
                  setSendError(null)
                  stick.current = true
                  try {
                    if (editing) {
                      setEditBusy(true)
                      await queueAction(sessionId, { type: 'edit', id: editing.id, text: prompt, attachments: [...new Set([...editing.originalPaths, ...files.map(f => f.path)])] })
                      useComposerDrafts.getState().finishEdit(sessionId)
                    } else await send(sessionId, prompt, files.map(f => f.path))
                  } catch (err) {
                    setSendError(err instanceof Error ? err.message : String(err))
                    throw err
                  } finally { setEditBusy(false) }
                }}
                meter={
                  <>
                    {totalTokens(sessionUsage) > 0 && <UsagePill usage={sessionUsage} title="本会话用量" />}
                    {context && <ContextMeter usage={context} />}
                  </>
                }
                chips={editing ? <span className="px-2 text-[12px] text-fg3">沿用原队列配置</span> :
                  <>
                    <ModelChip placement="top" value={chat.options.model} onChange={(model) => void setOptions(sessionId, { model }).catch(() => {})} />
                    <EffortChip
                      placement="top"
                      model={chat.options.model}
                      value={chat.options.effort}
                      onChange={(effort) => void setOptions(sessionId, { effort }).catch(() => {})}
                    />
                    <PermissionChip placement="top" value={chat.options.mode} onChange={(mode) => void setOptions(sessionId, { mode }).catch(() => {})} />
                  </>
                }
              />
              {sendError && <p className="px-1 text-[12.5px] text-danger">{editing ? '编辑失败：' : '操作失败：'}{sendError}</p>}
            </div>
          </div>
        </div>
      </div>
    </FileContext.Provider>
  )
}

function Message({
  message,
  running,
  cwd,
  onEdit,
  indicator,
  activeBlock
}: {
  message: UiMessage
  indicator?: ReactNode
  activeBlock?: number
  running: boolean
  cwd?: string
  onEdit?(text: string): Promise<void>
}) {
  if (message.role === 'notice') {
    if (message.source === 'internal') return <details className="my-3 text-[12px] text-fg3"><summary className="cursor-pointer">内部记录</summary><div className="mt-2 whitespace-pre-wrap break-words select-text">{blockText(message.blocks)}</div></details>
    if (message.source) {
      const label = message.source === 'unknown' ? (message.startsTurn ? '历史消息 · 来源未确认，按旧记录分组' : '消息 · 来源未确认') : message.originKind === 'task-notification' ? '任务通知' : message.originKind === 'peer' ? 'Agent 消息' : message.originKind === 'channel' ? '通道消息' : '外部消息'
      return <div className="my-3 text-[12px] text-fg3"><div>{label}</div><div className="mt-1 whitespace-pre-wrap break-words select-text">{blockText(message.blocks)}</div></div>
    }
    return <div className="my-3 text-center text-[12px] text-fg3">— {blockText(message.blocks)} —</div>
  }
  if (message.role === 'user') return <UserMessage message={message} text={blockText(message.blocks)} onEdit={onEdit} />
  return (
    <div className="my-3">
      {message.blocks.map((b, i) => {
        if (!b) return null
        const body = b.kind === 'text' ? (b.text ? <Markdown text={b.text} /> : null)
          : b.kind === 'thinking' ? null
          : b.kind === 'command' ? <CommandRecord block={b} onOpen={() => usePanel.getState().open({ kind: 'output', block: b })} />
          : <ToolCard block={b} running={running} cwd={cwd} />
        return <Fragment key={i}>{body}{i === activeBlock && indicator}</Fragment>
      })}
    </div>
  )
}

function blockText(blocks: UiBlock[]): string {
  return blocks.map((b) => (b?.kind === 'text' ? b.text : '')).join('\n')
}
