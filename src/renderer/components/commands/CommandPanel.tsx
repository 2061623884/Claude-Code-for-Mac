// 输入框上方的命令浮层：/usage、/context、/model、/effort、/config、/mcp 由应用直接处理，不发任何消息；
// 交给 Claude Code 执行的本地命令（/output-style…）的输出也显示在这里。Esc、× 或点外面关闭。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, RefreshCw, SquareTerminal, X } from 'lucide-react'
import type { CommandBlock, ContextUsage, McpStatus, SessionOptions, TokenUsage } from '@shared/chat'
import { commandText, commandTitle, CONFIG_LABELS, parseCommandOutput } from '@shared/commands'
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
  return <CommandOutput block={block} onRun={ctx.onRun} />
}

function AppBody({ name, ctx, onDone }: { name: AppPanel; ctx: PanelContext; onDone(): void }) {
  switch (name) {
    case 'usage':
      return <UsageBody session={ctx.sessionUsage} />
    case 'context':
      return <ContextBody ctx={ctx} />
    case 'model':
      return <ModelBody ctx={ctx} onDone={onDone} />
    case 'effort':
      return <EffortBody ctx={ctx} onDone={onDone} />
    case 'config':
      return <ConfigBody ctx={ctx} />
    case 'mcp':
      return <McpBody ctx={ctx} />
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

interface SelectItem {
  value: string
  label: string
  detail?: string
  active?: boolean
}

/** 带搜索的选择列表：打开即聚焦搜索框，↑↓ 移动，回车确认，当前值高亮 */
function SelectList({ items, placeholder, onSelect }: { items: SelectItem[]; placeholder: string; onSelect(value: string): void }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q ? items.filter((i) => `${i.label} ${i.value} ${i.detail ?? ''}`.toLowerCase().includes(q)) : items
  const [active, setActive] = useState(() => Math.max(items.findIndex((i) => i.active), 0))
  const index = Math.min(active, Math.max(shown.length - 1, 0))
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current?.children[index]?.scrollIntoView({ block: 'nearest' })
  }, [index])

  return (
    <div className="-m-3.5">
      <input
        autoFocus
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            const n = shown.length || 1
            setActive((index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
          } else if (e.key === 'Enter' && shown[index]) {
            e.preventDefault()
            onSelect(shown[index].value)
          }
        }}
        className="w-full border-b border-line bg-transparent px-3.5 py-2.5 text-[13.5px] outline-none placeholder:text-fg3"
      />
      <div ref={list} role="listbox" className="p-1.5">
        {shown.map((item, i) => (
          <div
            key={item.value}
            role="option"
            aria-selected={i === index}
            onMouseMove={() => i !== index && setActive(i)}
            onClick={() => onSelect(item.value)}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${i === index ? 'bg-active' : ''}`}
          >
            <span className="w-4 shrink-0 text-accent">{item.active && <Check size={14} />}</span>
            <span className="shrink-0">{item.label}</span>
            {item.detail && <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg3">{item.detail}</span>}
          </div>
        ))}
        {shown.length === 0 && <div className="px-2.5 py-2 text-[13px] text-fg3">没有匹配的选项</div>}
      </div>
    </div>
  )
}

function ModelBody({ ctx, onDone }: { ctx: PanelContext; onDone(): void }) {
  const models = useDesk((s) => s.meta?.models)
  if (!models) return <Note>模型列表加载中…</Note>
  return (
    <SelectList
      placeholder="搜索模型"
      items={models.map((m) => ({ value: m.value, label: m.label, detail: m.value, active: m.value === ctx.options.model }))}
      onSelect={(model) => {
        ctx.setOptions({ model })
        onDone()
      }}
    />
  )
}

function EffortBody({ ctx, onDone }: { ctx: PanelContext; onDone(): void }) {
  const info = useDesk((s) => s.meta?.models.find((m) => m.value === ctx.options.model))
  if (!info || info.efforts.length === 0) return <Note>当前模型不支持调节思考程度。</Note>
  return (
    <SelectList
      placeholder="搜索"
      items={EFFORT_LEVELS.filter((l) => info.efforts.includes(l.value)).map((l) => ({
        value: l.value,
        label: l.label,
        detail: l.description,
        active: l.value === ctx.options.effort
      }))}
      onSelect={(effort) => {
        ctx.setOptions({ effort: effort as SessionOptions['effort'] })
        onDone()
      }}
    />
  )
}

// 设置清单是固定的，整个应用读一次就够
let configList: Promise<string> | null = null

function ConfigBody({ ctx }: { ctx: PanelContext }) {
  const home = useDesk((s) => s.home)
  const cwd = ctx.cwd ?? home
  const [text, error] = useLoad<string>(() => {
    configList ??= window.desk.meta.config(cwd).catch((err: unknown) => {
      configList = null
      throw err
    })
    return configList
  }, [cwd])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Record<string, { value: string; text?: string; error?: string }>>({})

  if (error) return <Note>读取失败：{error}</Note>
  if (!text) return <Note>读取中…</Note>
  const view = parseCommandOutput('config', text)
  if (view.kind !== 'config') return <Note>{text}</Note>

  const q = query.trim().toLowerCase()
  const items = q ? view.items.filter((i) => `${i.key} ${CONFIG_LABELS[i.key] ?? ''}`.toLowerCase().includes(q)) : view.items
  const set = (key: string, value: string): void => {
    setResults((r) => ({ ...r, [key]: { value } }))
    window.desk.meta.config(cwd, `${key}=${value}`).then(
      (out) => setResults((r) => ({ ...r, [key]: { value, text: out } })),
      (err: unknown) => setResults((r) => ({ ...r, [key]: { value, error: errorText(err) } }))
    )
  }

  return (
    <div className="-m-3.5">
      <input
        autoFocus
        value={query}
        placeholder="搜索设置"
        onChange={(e) => setQuery(e.target.value)}
        className="w-full border-b border-line bg-transparent px-3.5 py-2.5 text-[13.5px] outline-none placeholder:text-fg3"
      />
      <p className="px-3.5 pt-2.5 text-[12px] text-fg3">选择后立即写入 Claude Code 的全局设置（不会发送任何消息）。暂时无法显示各项的当前值。</p>
      <div className="divide-y divide-line">
        {items.map((item) => {
          const r = results[item.key]
          return (
            <div key={item.key} className="flex items-center gap-4 px-3.5 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px]">{CONFIG_LABELS[item.key] ?? item.key}</div>
                <div className="truncate font-mono text-[11px] text-fg3">
                  {item.key}
                  {r && (
                    <span className={r.error ? 'text-danger' : 'text-accent'}>
                      {r.error ? ` · ${r.error}` : r.text ? ` · 已设为 ${r.value}` : ' · 正在保存…'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex max-w-[60%] flex-wrap justify-end gap-1">
                {item.values.length ? (
                  item.values.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => set(item.key, v)}
                      className={`rounded-lg border px-1.5 py-0.5 font-mono text-[11.5px] transition-colors ${
                        r?.value === v && !r.error ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line bg-bg text-fg2 hover:border-accent/40 hover:text-fg'
                      }`}
                    >
                      {v}
                    </button>
                  ))
                ) : (
                  <FreeValue onSubmit={(v) => set(item.key, v)} />
                )}
              </div>
            </div>
          )
        })}
        {items.length === 0 && <div className="px-3.5 py-3 text-[13px] text-fg3">没有匹配的设置</div>}
      </div>
    </div>
  )
}

function FreeValue({ onSubmit }: { onSubmit(value: string): void }) {
  const [value, setValue] = useState('')
  return (
    <input
      value={value}
      placeholder="输入后回车"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing && value.trim()) onSubmit(value.trim())
      }}
      className="w-32 rounded-lg border border-line bg-bg px-2 py-0.5 text-[12px] outline-none focus:border-accent/45"
    />
  )
}

const MCP_STATUS: Record<McpStatus['status'], { label: string; color: string }> = {
  connected: { label: '已连接', color: '#788c5d' },
  pending: { label: '连接中', color: '#a3a093' },
  'needs-auth': { label: '需要授权', color: '#c6a27a' },
  failed: { label: '连接失败', color: 'var(--danger)' },
  disabled: { label: '已停用', color: '#a3a093' }
}

function McpBody({ ctx }: { ctx: PanelContext }) {
  const home = useDesk((s) => s.home)
  const [list, error, reload] = useLoad<McpStatus[]>(() => window.desk.chat.mcp(ctx.sessionId, ctx.cwd ?? home), [ctx.sessionId, ctx.cwd])
  if (error) return <Note>读取失败：{error}</Note>
  if (!list) return <Note>读取中…</Note>
  if (list.length === 0) return <Note>没有配置 MCP 服务器。</Note>
  return (
    <>
      <div className="-mx-1.5 space-y-0.5">
        {list.map((s, i) => {
          const st = MCP_STATUS[s.status]
          return (
            <div key={s.name} className="animate-fade-up flex items-start gap-2.5 rounded-lg px-1.5 py-1.5" style={{ animationDelay: `${i * 30}ms` }}>
              <span className="mt-[7px] size-2 shrink-0 rounded-full" style={{ background: st.color }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-medium">{s.name}</span>
                  <span className="shrink-0 text-[12px] text-fg3">
                    {st.label}
                    {s.status === 'connected' && ` · ${s.tools} 个工具`}
                    {s.scope && ` · ${s.scope}`}
                  </span>
                </div>
                {s.error && <div className="mt-0.5 text-[12px] text-danger select-text">{s.error}</div>}
              </div>
            </div>
          )
        })}
      </div>
      <button type="button" onClick={reload} className="mt-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-fg3 hover:bg-hover hover:text-fg2">
        <RefreshCw size={12} />
        刷新
      </button>
    </>
  )
}
