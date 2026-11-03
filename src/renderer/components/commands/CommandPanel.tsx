import { ModePicker } from '../newSession/ModePicker'
import type { RuntimeSettings } from '@shared/chat'
import { ClaudeConfigSettings } from '../settings/ClaudeConfigSettings'
import { McpSettings } from '../settings/McpSettings'
// 输入框上方的命令浮层：/usage、/context、/model、/effort、/config、/mcp 由应用直接处理，不发任何消息；
// 交给 Claude Code 执行的本地命令（/output-style…）的输出也显示在这里。Esc、× 或点外面关闭。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, RefreshCw, SquareTerminal, X } from 'lucide-react'
import type { CommandBlock, ContextUsage, SessionOptions, TokenUsage } from '@shared/chat'
import { commandText, commandTitle,  parseCommandOutput } from '@shared/commands'
import { EFFORT_LEVELS, resetTimeZh } from '@shared/format'
import type { PlanUsage } from '@shared/types'
import { useDismiss } from '../../hooks/useDismiss'
import { errorText } from '../../ipcError'
import { usePanel, type AppPanel } from '../../panelStore'
import { useDesk } from '../../store'
import { CommandOutput, InlineCode } from './CommandOutput'
import { ContextBreakdown } from '../chat/ContextMeter'
import { UsageDetails } from '../chat/UsageStats'
import { UsageBar } from '../ui/UsageBar'

export interface PanelContext {
  /** 新建会话页还没有会话 */
  sessionId: string | null
  cwd?: string
  optionsUpdating?: boolean
  runtime?: RuntimeSettings
  options: SessionOptions
  setOptions(patch: Partial<SessionOptions>): void
  /** 把命令交给会话执行（浮层里的选项，如切换输出风格）；会话忙时不传 */
  onRun?(command: string): void
  /** 本会话累计的 token 用量（/usage 里显示） */
  sessionUsage?: TokenUsage
}

const TITLES: Record<AppPanel, string> = {
  usage: '套餐用量',
  context: '上下文窗口',
  model: '切换模型',
  effort: '思考程度',
  config: 'Claude Code 设置',
  mcp: 'MCP 服务器'
}

function focusComposer(): void {
  document.querySelector<HTMLElement>('[data-composer]')?.focus()
}

export function CommandPanel({ ctx }: { ctx: PanelContext }) {
  const panel = usePanel((s) => s.panel)
  const close = usePanel((s) => s.close)
  const box = useRef<HTMLDivElement>(null)

  useDismiss(box, panel !== null, (reason, event) => {
    close()
    if (reason !== 'escape') return
    event.preventDefault() // 这次 Esc 只关浮层
    focusComposer()
  })

  if (!panel) return null

  // 只有一行的结果（如「Set model to …」）显示成一条轻提示，几秒后自动消失
  if (panel.kind === 'output' && panel.block.output !== null && !panel.block.output.includes('\n')) {
    return <Toast key={panel.block.output} ref={box} text={panel.block.output} onDone={close} />
  }

  const title = panel.kind === 'app' ? TITLES[panel.name] : commandTitle(panel.block.name)
  const command = panel.kind === 'app' ? `/${panel.name}` : commandText(panel.block.name, panel.block.args)
  const done = (): void => {
    close()
    focusComposer()
  }

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={title}
      className="animate-pop-in absolute right-0 bottom-full left-0 z-40 mb-2 flex max-h-[min(60vh,560px)] flex-col overflow-hidden rounded-xl border border-line bg-card shadow-pop [transform-origin:bottom_center]"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line py-1.5 pr-1.5 pl-3.5 text-[12.5px]">
        <SquareTerminal size={13} className="shrink-0 text-fg3" />
        <span className="font-medium">{title}</span>
        <code className="min-w-0 truncate font-mono text-[11.5px] text-fg3">{command}</code>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="关闭（Esc）"
          title="关闭（Esc）"
          onClick={done}
          className="flex size-7 items-center justify-center rounded-lg text-fg3 hover:bg-hover hover:text-fg"
        >
          <X size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        {panel.kind === 'output' ? <OutputBody block={panel.block} ctx={ctx} /> : <AppBody name={panel.name} ctx={ctx} onDone={done} />}
      </div>
    </div>
  )
}

function Toast({ text, onDone, ref }: { text: string; onDone(): void; ref: React.Ref<HTMLDivElement> }) {
  useEffect(() => {
    const id = setTimeout(onDone, 3500)
    return () => clearTimeout(id)
  }, [onDone])
  return (
    <div ref={ref} className="absolute bottom-full left-0 z-40 mb-2 flex max-w-full">
      <div className="animate-pop-in flex items-start gap-2 rounded-xl border border-line bg-card px-3.5 py-2 text-[13px] shadow-pop [transform-origin:bottom_left]">
        <Check size={14} className="mt-[3px] shrink-0 text-accent" />
        <span className="min-w-0 text-fg2 select-text">
          <InlineCode text={text} />
        </span>
      </div>
    </div>
  )
}

function OutputBody({ block, ctx }: { block: CommandBlock; ctx: PanelContext }) {
  return <CommandOutput cwd={ctx.cwd ?? useDesk.getState().home} block={block} onRun={ctx.onRun} />
}

function AppBody({ name, ctx, onDone }: { name: AppPanel; ctx: PanelContext; onDone(): void }) {
  switch (name) {
    case 'usage':
      return <UsageBody session={ctx.sessionUsage} />
    case 'context':
      return <ContextBody ctx={ctx} />
    case 'model':
      return <PickerBody onDone={onDone} ctx={ctx} kind="model" />
    case 'effort':
      return <PickerBody onDone={onDone} ctx={ctx} kind="effort" />
    case 'config':
      return <ClaudeConfigSettings cwd={ctx.cwd ?? useDesk.getState().home} />
    case 'mcp':
      return <McpSettings sessionId={ctx.sessionId} cwd={ctx.cwd ?? useDesk.getState().home} />
  }
}

/** 读取一次数据；返回 [数据, 错误, 重新读取] */
function useLoad<T>(load: () => Promise<T>, deps: unknown[]): [T | null, string | null, () => void] {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let stale = false
    setError(null)
    load().then(
      (d) => !stale && setData(d),
      (err: Error) => !stale && setError(errorText(err))
    )
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return [data, error, () => setTick((t) => t + 1)]
}

function Note({ children }: { children: ReactNode }) {
  return <div className="py-1 text-[13px] text-fg3">{children}</div>
}

function UsageBody({ session }: { session?: TokenUsage }) {
  const [usage, error, reload] = useLoad<PlanUsage>(() => window.desk.meta.usage(), [])
  if (error) return <Note>读取失败：{error}</Note>
  if (!usage) return <Note>读取中…</Note>
  if (!usage.available) return <Note>当前登录方式不受套餐限额约束（例如使用 API Key）。</Note>
  const plan = usage.subscriptionType ? `${usage.subscriptionType[0]!.toUpperCase()}${usage.subscriptionType.slice(1)} 套餐` : null
  return (
    <>
      <div className="mb-3 flex items-center justify-between text-[12.5px] text-fg3">
        <span>{plan ?? '套餐用量'}</span>
        <button type="button" onClick={reload} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-hover hover:text-fg2">
          <RefreshCw size={12} />
          刷新
        </button>
      </div>
      <div className="space-y-3.5">
        {usage.windows.map((w, i) => (
          <div key={w.label} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
            <UsageBar label={w.label} percent={w.percent} reset={w.resetsAt ? resetTimeZh(w.resetsAt) : undefined} />
          </div>
        ))}
        {usage.windows.length === 0 && <Note>暂时没有用量数据。</Note>}
      </div>
      {session && (
        <div className="mt-4 border-t border-line pt-3.5">
          <UsageDetails usage={session} title="本会话" />
        </div>
      )}
    </>
  )
}

function ContextBody({ ctx }: { ctx: PanelContext }) {
  const { sessionId, cwd, options } = ctx
  const [usage, error] = useLoad<ContextUsage | null>(
    () => (sessionId && cwd ? window.desk.chat.context(sessionId, cwd, options.model) : Promise.resolve(null)),
    [sessionId, cwd, options.model]
  )
  if (!sessionId) return <Note>开始对话后可以查看上下文占用。</Note>
  if (error) return <Note>读取失败：{error}</Note>
  if (!usage) return <Note>读取中…</Note>
  return <ContextBreakdown usage={usage} />
}

function PickerBody({ ctx, kind, onDone }: { onDone(): void; ctx: PanelContext; kind: 'effort' | 'model' }) {
  return <ModePicker inline={kind} options={ctx.options} cwd={ctx.cwd} live={!!ctx.sessionId} runtime={ctx.runtime}
    busy={ctx.optionsUpdating} onChange={patch => { ctx.setOptions(patch); if (patch.model !== undefined || patch.effort !== undefined) onDone() }} onRetry={() => {if(ctx.sessionId) void window.desk.chat.refreshRuntime(ctx.sessionId)}} />
}
