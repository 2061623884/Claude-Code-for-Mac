import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronRight, RefreshCw } from 'lucide-react'
import type { ComposerAttachment } from '@shared/attachments'
import type { ContextUsage, UiBlock, UiMessage } from '@shared/chat'
import type { CommandInfo } from '@shared/types'
import { turnsOf } from '@shared/fileChanges'
import { sumUsage, totalTokens } from '@shared/usageStats'
import { useBtw } from '../../btwStore'
import { useChat } from '../../chatStore'
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
import { Markdown } from './Markdown'
import { ToolCard } from './ToolCard'
import { TurnFiles } from './TurnFiles'
import { AssistantActions } from './MessageActions'
import { UserMessage } from './UserMessage'
import { UsagePill } from './UsageStats'

// SDK 里没有 /btw，由应用自己实现，补进命令菜单
const EXTRA_COMMANDS: CommandInfo[] = [
  { name: 'btw', description: '顺便问一下：在右侧提问，不打断也不写入当前对话', argumentHint: '<问题>' }
]

export function ChatView({ sessionId, projectId }: { sessionId: string; projectId: string }) {
  const chat = useChat((s) => s.chats[sessionId])
  const { load, reload, send, edit, interrupt, setOptions, respond } = useChat()
  const cwd = useDesk((s) => s.projects.find((p) => p.id === projectId)?.path)
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [sendError, setSendError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    void load(sessionId, projectId)
    stick.current = true
  }, [load, sessionId, projectId])

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

  // 上下文占用：打开会话、每轮结束、换模型后刷新
  const [context, setContext] = useState<ContextUsage | null>(null)
  const model = chat?.options.model ?? null
  const count = chat?.messages.length ?? 0
  useEffect(() => {
    if (!idle || !cwd) return
    let stale = false
    window.desk.chat.context(sessionId, cwd, model).then((c) => !stale && setContext(c), () => {})
    return () => {
      stale = true
    }
  }, [idle, cwd, sessionId, model, count])

  useCommandAutoOpen(chat?.messages, chat?.loaded)
  const panelOpen = usePanel((s) => s.panel !== null)

  // 停在底部时，新内容到来自动滚动；用户往上翻时不打扰
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [chat?.messages, chat?.approvals.length, chat?.state])

  if (!chat) return <div className="flex-1" />

  const running = chat.state === 'running' || chat.state === 'awaiting'
  // 本地命令在对话里只留一行记录：隐藏紧挨着它的那条用户输入
  const hidden = new Set(
    chat.messages.filter((m, i) => m.role === 'user' && chat.messages[i + 1]?.blocks[0]?.kind === 'command').map((m) => m.id)
  )
  const turns = turnsOf(chat.messages)
  const sessionUsage = sumUsage(chat.messages)
  const approval = chat.approvals[0]
  // 命令卡片里的选项（切换模型等）：会话空闲时才能点
  const runCommand = chat.loaded && !running && !approval ? (command: string) => void send(sessionId, command) : undefined
  const panelCtx: PanelContext = {
    sessionId,
    cwd,
    options: chat.options,
    setOptions: (patch) => void setOptions(sessionId, patch),
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
                    .filter((m) => !m.parentToolUseId && !hidden.has(m.id))
                    .map((m) => (
                      <Message
                        key={m.id}
                        message={m}
                        running={running}
                        cwd={cwd}
                        // 编辑历史消息：会话空闲时才能改
                        onEdit={running || approval || m.forkFrom === undefined ? undefined : (text) => edit(sessionId, m.id, text)}
                      />
                    ))}
                  {/* 每轮结束后列出这一轮改过的文件，点开在右栏看对比 */}
                  {!(running && i === turns.length - 1) && (
                    <>
                      <TurnFiles messages={turn} cwd={cwd} />
                      <AssistantActions turn={turn} />
                    </>
                  )}
                </Fragment>
              ))}
              {chat.state === 'running' && <Thinking />}
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
                  onDecide={(d) => void respond(sessionId, approval.requestId, d)}
                />
              )}
              <Composer
                value={text}
                onChange={setText}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
                rows={2}
                autoFocus
                cwd={cwd}
                placeholder={approval ? '处理上方请求后继续' : running ? '继续输入，Claude 会在当前步骤后看到' : '回复 Claude…'}
                running={running}
                onStop={() => void interrupt(sessionId)}
                canSubmit={Boolean(chat.loaded && !approval)}
                submitHint="发送（Enter）"
                extraCommands={EXTRA_COMMANDS}
                panel={panelOpen && <CommandPanel ctx={panelCtx} />}
                onCommand={(name, args) => {
                  if (name === 'btw') {
                    const pageId = useLayout.getState().newPage(cwd, 'chat')
                    if (pageId && args && cwd) void useBtw.getState().ask(pageId, sessionId, cwd, args, chat.options)
                    return true
                  }
                  return openAppPanel(name, args)
                }}
                onSubmit={async ({ prompt }) => {
                  setSendError(null)
                  stick.current = true
                  try {
                    await send(sessionId, prompt)
                  } catch (err) {
                    setSendError(err instanceof Error ? err.message : String(err))
                    throw err
                  }
                }}
                meter={
                  <>
                    {totalTokens(sessionUsage) > 0 && <UsagePill usage={sessionUsage} title="本会话用量" />}
                    {context && <ContextMeter usage={context} />}
                  </>
                }
                chips={
                  <>
                    <ModelChip placement="top" value={chat.options.model} onChange={(model) => void setOptions(sessionId, { model })} />
                    <EffortChip
                      placement="top"
                      model={chat.options.model}
                      value={chat.options.effort}
                      onChange={(effort) => void setOptions(sessionId, { effort })}
                    />
                    <PermissionChip placement="top" value={chat.options.mode} onChange={(mode) => void setOptions(sessionId, { mode })} />
                  </>
                }
              />
              {sendError && <p className="px-1 text-[12.5px] text-danger">发送失败：{sendError}</p>}
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
  onEdit
}: {
  message: UiMessage
  running: boolean
  cwd?: string
  onEdit?(text: string): Promise<void>
}) {
  if (message.role === 'notice') {
    return <div className="my-3 text-center text-[12px] text-fg3">— {blockText(message.blocks)} —</div>
  }
  if (message.role === 'user') return <UserMessage message={message} text={blockText(message.blocks)} onEdit={onEdit} />
  return (
    <div className="my-3">
      {message.blocks.map((b, i) => {
        if (!b) return null
        if (b.kind === 'text') return b.text ? <Markdown key={i} text={b.text} /> : null
        if (b.kind === 'thinking') return b.text ? <ThinkingBlock key={i} text={b.text} /> : null
        if (b.kind === 'command') return <CommandRecord key={i} block={b} onOpen={() => usePanel.getState().open({ kind: 'output', block: b })} />
        return <ToolCard key={b.id} block={b} running={running} cwd={cwd} />
      })}
    </div>
  )
}

function blockText(blocks: UiBlock[]): string {
  return blocks.map((b) => (b?.kind === 'text' ? b.text : '')).join('\n')
}

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="my-2">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[12.5px] text-fg3 hover:text-fg2">
        <ChevronRight size={13} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        思考过程
      </button>
      {open && <div className="mt-1 border-l-2 border-line pl-3 text-[13px] whitespace-pre-wrap text-fg2 select-text">{text}</div>}
    </div>
  )
}

function Thinking() {
  return (
    <div className="my-3 flex items-center gap-2 text-[13px] text-fg3">
      <span className="flex gap-1">
        <span className="size-1.5 animate-pulse rounded-full bg-fg3" />
        <span className="size-1.5 animate-pulse rounded-full bg-fg3 [animation-delay:150ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-fg3 [animation-delay:300ms]" />
      </span>
      Claude 正在工作…
    </div>
  )
}
