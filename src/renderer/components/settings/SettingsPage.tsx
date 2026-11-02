import { ClaudeConfigSettings } from './ClaudeConfigSettings'
import { McpSettings } from './McpSettings'
import { useState, type ReactNode } from 'react'
import type { Settings, Theme } from '@shared/types'
import { errorText } from '../../ipcError'
import { EFFORT_LEVELS, PERMISSION_MODES } from '@shared/format'
import { useDesk } from '../../store'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: '跟随系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }
]
export const CONFIG_GROUPS = {
  models: ['model', 'permissionMode', 'thinking', 'useAutoModeDuringPlan', 'switchModelsOnFlag'],
  context: ['autoCompact', 'language', 'outputStyle', 'gitignore'],
  workflows: ['workflows', 'workflowKeywordTriggerEnabled', 'workflowSizeGuideline', 'worktreeBaseRef'],
  terminal: ['theme', 'autoScroll', 'reduceMotion', 'copyOnSelect', 'copyFullResponse', 'editor', 'defaultToAgentsView', 'leftArrowOpensAgents', 'prStatus', 'progressBar', 'promptSuggestionEnabled', 'recap', 'timeFormat', 'tips', 'turnDuration', 'verbose', 'autoConnectIde', 'externalEditorContext'],
  terminalNotifications: ['agentPushNotifEnabled', 'inputNeededNotifEnabled', 'notifChannel'],
  remote: ['remoteControl'],
  checkpoints: ['checkpoints']
} as const
const GROUPED_KEYS = Object.values(CONFIG_GROUPS).flat()

export function SettingsPage() {
  const { settings, meta, metaError, updateSettings, view, projects, home, setView } = useDesk()
  const [languageSaving, setLanguageSaving] = useState(false)
  const [languageError, setLanguageError] = useState<string | null>(null)
  const [scope, setScope] = useState('desktop')
  const [notificationError, setNotificationError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const saveSettings = (patch: Partial<Settings>): void => {
    setSettingsError(null)
    void updateSettings(patch).catch(error => setSettingsError(errorText(error)))
  }
  if (!settings) return null
  const route = view.kind === 'settings' ? view : { kind: 'settings' as const }
  // Existing /config links open the unified settings, without a second full catalog.
  const tab = route.tab === 'claude' ? 'models' : route.tab ?? 'general'
  const project = projects.find(p => p.id === route.projectId)
  const cwd = project?.path ?? home
  const native = tab === 'context' || tab === 'advanced' || tab === 'mcp' || (tab === 'models' && scope === 'terminal')
  return <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-16"><div className="mx-auto max-w-[760px]">
    <h1 className="pt-6 font-serif text-[24px] font-normal">设置</h1>
    <nav className="mt-5 flex flex-wrap gap-1 border-b border-line pb-3" aria-label="设置分类">
      {([['general', '外观与交互'], ['models', '模型与权限'], ['context', '上下文'], ['notifications', '通知'], ['mcp', '连接与 MCP'], ['advanced', '高级设置']] as const).map(([value, label]) => <button key={value} type="button" aria-current={tab === value ? 'page' : undefined} onClick={() => setView({ ...route, tab: value })} className={`rounded-lg px-3 py-1.5 text-[13px] ${tab === value ? 'bg-active' : 'text-fg2 hover:bg-hover'}`}>{label}</button>)}
    </nav>
    {settingsError && <p role="alert" className="mt-3 text-danger">设置保存失败：{settingsError}</p>}
    {native && <div className="mt-5 flex items-center gap-3"><label htmlFor="settings-project" className="text-fg2">项目</label><select id="settings-project" value={project?.id ?? ''} onChange={e => setView({ ...route, projectId: e.target.value || null, sessionId: null })} className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 py-1.5"><option value="">用户目录</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
    {tab === 'general' && <Section title="桌面端">
      <Row label="主题"><Segmented options={THEMES} value={settings.theme} onChange={theme => saveSettings({ theme })} /></Row>
      <Row label="自动跟随最新回复"><Toggle label="自动跟随最新回复" value={settings.autoScroll ?? true} onChange={autoScroll => saveSettings({ autoScroll })} /></Row>
      <Row label="减少动效"><Toggle label="减少动效" value={settings.reduceMotion ?? false} onChange={reduceMotion => saveSettings({ reduceMotion })} /></Row>
      <Row label="执行提示语言" hint="仅影响小螃蟹旁的文案，保存后生效">
        <select aria-label="执行提示语言" disabled={languageSaving} value={settings.executionLanguage ?? 'zh'} className="rounded-lg border border-line bg-bg px-2 py-1.5" onChange={async e => {
          const executionLanguage = e.target.value === 'en' ? 'en' : 'zh'
          setLanguageSaving(true); setLanguageError(null)
          try { await updateSettings({ executionLanguage }) }
          catch (error) { setLanguageError(error instanceof Error ? error.message : String(error)) }
          finally { setLanguageSaving(false) }
        }}><option value="zh">中文</option><option value="en">English</option></select>
      </Row>
      {languageError && <p role="alert" className="px-4 py-2 text-danger">{languageError}</p>}
    </Section>}
    {tab === 'models' && <>
      <div className="mt-5"><Segmented options={[{ value: 'desktop', label: '桌面新对话' }, { value: 'terminal', label: '终端默认值' }]} value={scope} onChange={setScope} /></div>
      {scope === 'desktop' ? <Section title="新对话默认值">
        <Row label="模型"><Select value={settings.defaultModel} options={(meta?.models ?? [{ value: settings.defaultModel, label: settings.defaultModel }]).map(m => ({ value: m.value, label: m.label }))} onChange={defaultModel => saveSettings({ defaultModel })} /></Row>
        <Row label="思考程度"><Select value={settings.defaultEffort} options={EFFORT_LEVELS} onChange={v => saveSettings({ defaultEffort: v as typeof settings.defaultEffort })} /></Row>
        <Row label="权限模式"><Select value={settings.defaultPermissionMode} options={PERMISSION_MODES.filter(m => m.value !== 'bypassPermissions' || settings.allowBypass)} onChange={v => saveSettings({ defaultPermissionMode: v as typeof settings.defaultPermissionMode })} /></Row>
        <Row label="允许选择跳过权限模式"><Toggle label="允许选择跳过权限模式" value={settings.allowBypass} onChange={allowBypass => saveSettings({ allowBypass, ...(!allowBypass && settings.defaultPermissionMode === 'bypassPermissions' ? { defaultPermissionMode: 'default' as const } : {}) })} /></Row>
      </Section> : <ClaudeConfigSettings key={cwd} cwd={cwd} keys={CONFIG_GROUPS.models} searchable={false} />}
    </>}
    {tab === 'context' && <ClaudeConfigSettings key={cwd} cwd={cwd} keys={CONFIG_GROUPS.context} searchable={false} />}
    {tab === 'notifications' && <>
      <Section title="桌面系统通知 · 窗口在后台时">
        <Row label="任务结束"><Toggle label="任务结束" value={settings.notifyCompletion ?? true} onChange={notifyCompletion => saveSettings({ notifyCompletion })} /></Row>
        <Row label="等待确认"><Toggle label="等待确认" value={settings.notifyApproval ?? true} onChange={notifyApproval => saveSettings({ notifyApproval })} /></Row>
        <Row label="通知声音"><Toggle label="通知声音" value={settings.notificationSound ?? true} onChange={notificationSound => saveSettings({ notificationSound })} /></Row>
        <Row label="系统通知"><button className="rounded-lg bg-chip px-3 py-1.5" onClick={async () => {
          setNotificationError(null)
          try {
            const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
            if (permission === 'denied') throw new Error('请在 macOS 系统设置中允许 Claude Code 通知')
            new Notification('Claude Code', { body: '通知测试', silent: settings.notificationSound === false })
          } catch (e) { setNotificationError(e instanceof Error ? e.message : String(e)) }
        }}>发送测试通知</button></Row>
      </Section>
      {notificationError && <p role="alert" className="mt-3 text-danger">{notificationError}</p>}
    </>}
    {tab === 'mcp' && <McpSettings key={`${cwd}:${route.sessionId}`} sessionId={route.sessionId ?? null} cwd={cwd} />}
    {tab === 'advanced' && <>
      <ClaudeConfigSettings key={cwd} cwd={cwd} groups={[
        { title: '工作流', keys: CONFIG_GROUPS.workflows },
        { title: '终端外观与交互', keys: CONFIG_GROUPS.terminal },
        { title: '终端通知', keys: CONFIG_GROUPS.terminalNotifications },
        { title: '终端远程控制', keys: CONFIG_GROUPS.remote },
        { title: '终端文件检查点', keys: CONFIG_GROUPS.checkpoints },
        { title: '其他原生选项', excludeKeys: GROUPED_KEYS }
      ]} />
      <Section title="运行环境">
        <Row label="可执行文件"><span className="text-fg2" title={settings.claudePath ?? undefined}>{settings.claudePath ? '自定义路径' : `SDK 内置${meta?.claudeVersion ? ` v${meta.claudeVersion}` : ''}`}</span></Row>
        <Row label="账户"><span className="text-fg2">{metaError ? '读取失败' : (meta?.subscriptionType ?? '读取中…')}</span></Row>
      </Section>
    </>}
  </div></div>
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange(value: boolean): void }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={value} onClick={() => onChange(!value)} className={`relative h-6 w-10 rounded-full ${value ? 'bg-accent' : 'bg-line-strong'}`}><span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm ${value ? 'translate-x-4' : ''}`} /></button>
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
