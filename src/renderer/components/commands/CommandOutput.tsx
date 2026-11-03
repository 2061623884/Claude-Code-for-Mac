import { useState, type ReactNode } from 'react'
import { useClaudeConfig } from '../../hooks/useClaudeConfig'
import { ChevronRight, RotateCw } from 'lucide-react'
import type { CommandBlock } from '@shared/chat'
import { commandText, CONFIG_LABELS, VALUE_LABELS, parseCommandOutput, type CommandView } from '@shared/commands'
import { ContextBreakdown } from '../chat/ContextMeter'
import { Markdown } from '../chat/Markdown'
import { UsageBar } from '../ui/UsageBar'

const CURRENT_ZH: [RegExp, string][] = [
  [/^Current model:\s*/i, '当前模型：'],
  [/^Advisor:\s*/i, '顾问模型：'],
  [/^Output style:\s*/i, '当前风格：']
]

/** 本地斜杠命令的输出内容（显示在输入框上方的浮层里）。onRun 用来执行其中的选项（如切换风格），会话忙时不传 */
export function CommandOutput({ block, onRun, cwd }: { cwd: string; block: CommandBlock; onRun?(command: string): void }) {
  if (block.output === null) {
    return (
      <div className="flex items-center gap-3 text-[13px] text-fg3">
        <span className="min-w-0 flex-1">这条命令的输出没有保存在会话记录里。</span>
        {onRun && <ActionButton onClick={() => onRun(commandText(block.name, block.args))} icon={<RotateCw size={12} />} label="重新运行" />}
      </div>
    )
  }
  const view = parseCommandOutput(block.name, block.output)
  if (view.kind === 'config') return <ConfigRows items={view.items} cwd={cwd} onRun={onRun} />
  return <Body view={view} name={block.name} onRun={onRun} />
}

function Body({ view, name, onRun }: { view: Exclude<CommandView, { kind: 'config' }>; name: string; onRun?(command: string): void }) {
  switch (view.kind) {
    case 'context':
      return (
        <>
          <ContextBreakdown usage={view} title={view.model ?? '已用'} />
          {view.details && (
            <Details title="记忆文件与技能明细">
              <div className="text-[13px] [&_.md]:text-[13px]">
                <Markdown text={view.details} />
              </div>
            </Details>
          )}
        </>
      )
    case 'usage':
      return (
        <>
          <div className="space-y-3.5">
            {view.windows.map((w, i) => (
              <div key={w.label} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                <UsageBar label={w.label} percent={w.percent} reset={w.reset ? `${w.reset} 重置` : undefined} />
              </div>
            ))}
          </div>
          {view.details && (
            <Details title="用量构成（基于本机记录估算）">
              <Pre text={view.details} />
            </Details>
          )}
        </>
      )
    case 'choice': {
      const run = (value: string): void => onRun?.(`/${name} ${value}`)
      const listed = view.options.some((o) => o.detail)
      return (
        <>
          {view.current && <div className="mb-3 text-[13px] text-fg2 select-text">{translateCurrent(view.current)}</div>}
          {listed ? (
            <div className="-mx-1.5 space-y-0.5">
              {view.options.map((o, i) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={!onRun}
                  onClick={() => run(o.value)}
                  style={{ animationDelay: `${i * 25}ms` }}
                  className="animate-fade-up flex w-full items-baseline gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-hover disabled:hover:bg-transparent"
                >
                  <span className={`shrink-0 font-medium ${o.current ? 'text-accent' : ''}`}>{o.value}</span>
                  {o.current && <span className="shrink-0 text-[11.5px] text-accent">当前</span>}
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg3">{o.detail}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {view.options.map((o, i) => (
                <OptionChip key={o.value} label={o.value} active={o.current} disabled={!onRun} delay={i * 20} onClick={() => run(o.value)} />
              ))}
            </div>
          )}
          {onRun && <p className="mt-3 text-[12px] text-fg3">点击选项即可切换</p>}
        </>
      )
    }
    case 'text':
      return view.markdown ? <Markdown text={view.text} /> : <Pre text={view.text} />
    case 'line':
      return <InlineCode text={view.text} />
  }
}

function translateCurrent(text: string): string {
  for (const [re, zh] of CURRENT_ZH) if (re.test(text)) return text.replace(re, zh)
  return text
}

/** 把 `代码` 片段显示成行内代码 */
export function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith('`') && part.endsWith('`') ? (
          <code key={i} className="rounded bg-chip px-1 py-px font-mono text-[0.9em] text-fg">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        )
      )}
    </>
  )
}

function Pre({ text }: { text: string }) {
  return <pre className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-fg2 select-text">{text}</pre>
}

function Details({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[12.5px] text-fg3 hover:text-fg2">
        <ChevronRight size={13} className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        {title}
      </button>
      {open && <div className="animate-fade-up mt-2">{children}</div>}
    </div>
  )
}

function OptionChip({
  label,
  active,
  disabled,
  small,
  delay = 0,
  onClick
}: {
  label: string
  active?: boolean
  disabled?: boolean
  small?: boolean
  delay?: number
  onClick(): void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className={`animate-fade-up rounded-lg border font-mono transition-colors ${small ? 'px-1.5 py-0.5 text-[11.5px]' : 'px-2.5 py-1 text-[12.5px]'} ${
        active ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line bg-bg text-fg2 enabled:hover:border-accent/40 enabled:hover:text-fg'
      }`}
    >
      {label}
    </button>
  )
}

function ActionButton({ onClick, icon, label }: { onClick(): void; icon: ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-medium text-fg2 hover:bg-hover">
      {icon}
      {label}
    </button>
  )
}

function ConfigRows({ items, cwd, onRun }: { items: Extract<CommandView, { kind: 'config' }>['items']; cwd: string; onRun?(command: string): void }) {
  const { snapshot } = useClaudeConfig(cwd)
  return (
<div className="-mx-3.5 -my-3.5 max-h-[380px] divide-y divide-line overflow-y-auto">
          {items.map(item => {
            const current = snapshot?.items.find(entry => entry.key === item.key)
            const disabled = !onRun || !!current?.locked
            const value = current?.value ?? ''
            const toggle = item.values.length === 2 && item.values.includes('true') && item.values.includes('false') && ['true', 'false'].includes(value)
            return (
            <label key={item.key} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[13px]">
              <span title={item.key}>{CONFIG_LABELS[item.key] ?? item.key}</span>
              {toggle ? <button type="button" role="switch" aria-checked={value === 'true'} aria-label={CONFIG_LABELS[item.key] ?? item.key}
                disabled={disabled} title={current?.locked}
                onClick={() => onRun?.(`/config ${item.key}=${value !== 'true'}`)}
                className={`relative h-6 w-10 shrink-0 rounded-full disabled:opacity-50 ${value === 'true' ? 'bg-accent' : 'bg-line-strong'}`}>
                <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm ${value === 'true' ? 'translate-x-4' : ''}`} />
              </button> : item.values.length ? (
                <select aria-label={CONFIG_LABELS[item.key] ?? item.key} disabled={disabled} value={value}
                  onChange={e => onRun?.(`/config ${item.key}=${e.target.value}`)}
                  className="h-8 max-w-[55%] rounded-lg border border-line bg-bg px-2">
                  <option value="" disabled>选择值</option>
                  {value && !item.values.includes(value) && <option value={value}>{VALUE_LABELS[value] ?? value}</option>}
                  {item.values.map(value => <option key={value} value={value}>{VALUE_LABELS[value] ?? value}</option>)}
                </select>
              ) : <input key={value} defaultValue={value} disabled={disabled} placeholder="输入值，回车应用" className="h-8 w-40 max-w-[55%] rounded-lg border border-line bg-bg px-2"
                onKeyDown={e => {
                  const value = e.currentTarget.value.trim()
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && value) onRun?.(`/config ${item.key}=${value}`)
                }} />}
            </label>
          )})}
        </div>
      )
}
