import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { CONFIG_LABELS } from '@shared/commands'
import { useClaudeConfig } from '../../hooks/useClaudeConfig'

const VALUE_LABELS: Record<string, string> = {
  true: '开启', false: '关闭', default: '默认', auto: '自动', normal: '普通', vim: 'Vim',
  light: '浅色', dark: '深色', 'light-daltonized': '浅色（色觉辅助）', 'dark-daltonized': '深色（色觉辅助）',
  'light-ansi': '浅色 ANSI', 'dark-ansi': '深色 ANSI',
  'Switch automatically': '自动切换', 'Ask each time': '每次询问', 'Not asked yet': '尚未选择',
  Proactive: '主动', Concise: '简洁', Explanatory: '讲解', Learning: '学习',
  '12-hour': '12 小时制', '24-hour': '24 小时制', '24-hour-utc': '24 小时制（UTC）',
  small: '小', medium: '中', large: '大', unrestricted: '不限',
  fresh: '最新基准', head: '当前 HEAD', plan: '计划', acceptEdits: '自动接受编辑', dontAsk: '不询问',
  terminal_bell: '终端提示音', notifications_disabled: '关闭通知'
}
type ConfigGroup = { title: string; keys?: readonly string[]; excludeKeys?: readonly string[] }
export function ClaudeConfigSettings({ cwd, keys, excludeKeys, searchable = true, groups }: { cwd: string; keys?: readonly string[]; excludeKeys?: readonly string[]; searchable?: boolean; groups?: ConfigGroup[] }) {
  const { snapshot, error, saving, results, save, refresh } = useClaudeConfig(cwd)
  const [query, setQuery] = useState('')
  const items = snapshot?.items.filter(i => (!keys || keys.includes(i.key)) && !excludeKeys?.includes(i.key)).filter(i => `${i.key} ${CONFIG_LABELS[i.key] ?? ''}`.toLowerCase().includes(query.toLowerCase().trim())) ?? []
  const sections = (groups ?? [{ title: '' }]).map(group => ({ ...group, items: items.filter(item => (!group.keys || group.keys.includes(item.key)) && !group.excludeKeys?.includes(item.key)) })).filter(group => group.items.length)
  return <section aria-label="Claude Code 配置" className="mt-5">
    <div className="mb-3 flex items-center gap-3">
      {searchable && <input aria-label="搜索 Claude Code 设置" placeholder="搜索设置" value={query} onChange={e => setQuery(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 outline-none focus:border-accent" />}
      <button type="button" aria-label="刷新 Claude Code 设置" disabled={!!saving} onClick={refresh} className="rounded-md p-2 text-fg2 hover:bg-hover"><RefreshCw size={15} /></button>
    </div>
    {error ? <p role="alert" className="text-danger">{error}</p> : !snapshot ? <p className="text-fg3">读取中…</p> : <>
      {sections.map(group => <section key={group.title} className={group.title ? 'mt-7' : undefined}>
        {group.title && <h2 className="mb-2 text-[13px] font-medium text-fg2">{group.title}</h2>}
        <div className="divide-y divide-line rounded-xl border border-line">
      {group.items.map(item => {
        const boolean = item.values.length === 2 && item.values.includes('true') && item.values.includes('false') && (item.value === 'true' || item.value === 'false')
        const disabled = !!saving || !!item.locked
        return <div key={item.key} className="px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label id={`label-${item.key}`} htmlFor={`config-${item.key}`} title={`${item.key}${item.source === 'default' ? ' · 原生默认值' : ''}${item.locked ? ' · ' + item.locked : ''}`} className="text-[13px]">{CONFIG_LABELS[item.key] ?? item.key}</label>
            {boolean ? <button id={`config-${item.key}`} type="button" role="switch" aria-labelledby={`label-${item.key}`} aria-checked={item.value === 'true'} disabled={disabled} title={item.locked} onClick={() => void save(item.key, item.value === 'true' ? 'false' : 'true')} className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50 ${item.value === 'true' ? 'bg-accent' : 'bg-line-strong'}`}><span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${item.value === 'true' ? 'translate-x-4' : ''}`} /></button>
            : item.values.length ? <select id={`config-${item.key}`} disabled={disabled} value={item.value ?? ''} title={item.locked} onChange={e => void save(item.key, e.target.value)} className="h-9 max-w-full rounded-lg border border-line bg-bg px-2 text-[13px]">
              {item.value === null && <option value="" disabled>无法确认当前值</option>}
              {item.value !== null && !item.values.includes(item.value) && <option value={item.value}>{VALUE_LABELS[item.value] ?? item.value}</option>}
              {item.values.map(v => <option key={v} value={v}>{VALUE_LABELS[v] ?? v}</option>)}
            </select> : <ConfigInput key={`${item.key}:${item.value}`} id={`config-${item.key}`} initialValue={item.value} disabled={disabled} onSave={value => void save(item.key, value)} />}
          </div>
          {saving === item.key ? <p role="status" className="mt-1 text-[12px] text-fg3">保存中…</p> : results[item.key] && <p role={results[item.key].error ? 'alert' : 'status'} className={`mt-1 text-[12px] ${results[item.key].error ? 'text-danger' : 'text-fg3'}`}>{results[item.key].error ?? '已保存'}</p>}
        </div>
      })}
        </div>
      </section>)}
      {!sections.length && <p className="p-4 text-fg3">没有匹配的设置</p>}
    </>}
  </section>
}
function ConfigInput({ id, initialValue, disabled, onSave }: { id: string; initialValue: string | null; disabled: boolean; onSave(value: string): void }) {
  const [value, setValue] = useState(initialValue ?? '')
  return <form onSubmit={e => { e.preventDefault(); if (!disabled && value.trim() && value !== initialValue) onSave(value.trim()) }} className="flex max-w-full gap-2">
    <input id={id} value={value} disabled={disabled} onChange={e => setValue(e.target.value)} placeholder={initialValue === null ? '无法确认当前值' : undefined} onKeyDown={e => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault() }} className="min-w-0 w-40 rounded-lg border border-line bg-bg px-3 py-2 outline-none focus:border-accent" />
    <button type="submit" disabled={disabled || !value.trim() || value === initialValue} className="rounded-lg bg-chip px-3 disabled:opacity-40">保存</button>
  </form>
}
