import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import type { PlanUsage, Theme } from '@shared/types'
import { EFFORT_LEVELS, PERMISSION_MODES, resetTimeZh } from '@shared/format'
import { useDesk } from '../../store'
import { UsageBar } from '../ui/UsageBar'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' }
]

export function SettingsPage() {
  const { settings, meta, metaError, updateSettings } = useDesk()
  if (!settings) return null

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-16">
      <div className="mx-auto max-w-[640px]">
        <h1 className="pt-6 font-serif text-[24px] font-normal">设置</h1>

        <UsageSection />

        <Section title="外观">
          <Row label="主题">
            <Segmented
              options={THEMES}
              value={settings.theme}
              onChange={(theme) => void updateSettings({ theme })}
            />
          </Row>
        </Section>

        <Section title="新对话默认值">
          <Row label="模型">
            <Select
              value={settings.defaultModel}
              options={(meta?.models ?? [{ value: settings.defaultModel, label: settings.defaultModel }]).map((m) => ({ value: m.value, label: m.label }))}
              onChange={(v) => void updateSettings({ defaultModel: v })}
            />
          </Row>
          <Row label="思考程度">
            <Select
              value={settings.defaultEffort}
              options={EFFORT_LEVELS}
              onChange={(v) => void updateSettings({ defaultEffort: v as typeof settings.defaultEffort })}
            />
          </Row>
          <Row label="权限模式">
            <Select
              value={settings.defaultPermissionMode}
              options={PERMISSION_MODES.filter((m) => m.value !== 'bypassPermissions' || settings.allowBypass)}
              onChange={(v) => void updateSettings({ defaultPermissionMode: v as typeof settings.defaultPermissionMode })}
            />
          </Row>
        </Section>

        <Section title="Claude Code">
          <Row label="可执行文件" hint={settings.claudePath ?? undefined}>
            <span className="text-fg2">
              {settings.claudePath ? '自定义路径' : `SDK 内置${meta?.claudeVersion ? ` v${meta.claudeVersion}` : ''}`}
            </span>
          </Row>
          <Row label="账户">
            <span className="text-fg2">
              {metaError ? '读取失败，请在终端运行 claude 并完成登录' : (meta?.subscriptionType ?? '读取中…')}
            </span>
          </Row>
          <Row label="允许「跳过所有权限」模式" hint="开启后可在新对话中选择该模式。Claude 将不再询问任何操作，存在风险。">
            <input
              type="checkbox"
              checked={settings.allowBypass}
              onChange={(e) => void updateSettings({ allowBypass: e.target.checked })}
              className="size-4"
            />
          </Row>
        </Section>
      </div>
    </div>
  )
}

function UsageSection() {
  const [usage, setUsage] = useState<PlanUsage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    window.desk.meta
      .usage()
      .then(setUsage, (err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])

  const refresh = (
    <button
      type="button"
      onClick={load}
      disabled={loading}
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-fg3 hover:bg-hover hover:text-fg2"
    >
      <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
      刷新
    </button>
  )

  let body: ReactNode
  if (error) body = <Note>读取失败：{error}</Note>
  else if (!usage) body = <Note>读取中…</Note>
  else if (!usage.available) body = <Note>当前登录方式不受套餐限额约束（例如使用 API Key）。</Note>
  else if (usage.windows.length === 0) body = <Note>暂时没有用量数据。</Note>
  else
    body = usage.windows.map((w) => (
      <div key={w.label} className="px-4 py-3">
        <UsageBar label={w.label} percent={w.percent} reset={w.resetsAt ? resetTimeZh(w.resetsAt) : undefined} />
      </div>
    ))

  const plan = usage?.subscriptionType ? `${usage.subscriptionType[0]!.toUpperCase()}${usage.subscriptionType.slice(1)} 套餐` : ''
  return (
    <Section title={`用量${plan ? ` · ${plan}` : ''}`} action={refresh}>
      {body}
    </Section>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3 text-fg2">{children}</div>
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[12.5px] font-medium text-fg3">{title}</h2>
        {action}
      </div>
      <div className="divide-y divide-line rounded-xl border border-line">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div>{label}</div>
        {hint && <div className="mt-0.5 truncate text-[12px] text-fg3">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange(v: T): void }) {
  return (
    <div className="flex rounded-lg bg-chip p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`h-7 rounded-md px-3 text-[12.5px] ${value === o.value ? 'bg-card text-fg shadow-sm' : 'text-fg2 hover:text-fg'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Select({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange(v: string): void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border border-line bg-card px-2 text-[13px] text-fg outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
