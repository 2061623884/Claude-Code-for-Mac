import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FolderOpen, LoaderCircle, Plus, Puzzle, RefreshCw, RotateCw, Search, Server, SquareSlash, Sparkles } from 'lucide-react'
import type { McpStatus } from '@shared/chat'
import type { PluginInfo, SkillCatalog, SkillInfo, SkillSource } from '@shared/skills'
import { useDesk } from '../../store'
import { errorText } from '../../ipcError'
import { IconButton } from '../sidebar/SessionRow'
import { Button, Dialog } from '../ui/Dialog'
import { Markdown } from '../chat/Markdown'
import { settingsInputClass, Toggle } from '../settings/SettingsControls'
import { SkillsIcon } from './SkillsIcon'
import { NewSkillDialog } from './NewSkillDialog'

type Tab = 'skills' | 'mcp'
type Filter = 'all' | SkillSource

const SOURCES: { value: SkillSource; label: string }[] = [
  { value: 'user', label: '个人' },
  { value: 'project', label: '项目' },
  { value: 'synced', label: '账号同步' },
  { value: 'plugin', label: '插件' }
]
const SOURCE_LABEL = Object.fromEntries(SOURCES.map(s => [s.value, s.label])) as Record<SkillSource, string>
const MCP_SCOPES: Record<string, string> = { user: '所有项目', project: '当前项目', local: '本地项目', managed: '组织管理', dynamic: '动态', claudeai: 'claude.ai' }
const MCP_STATUS: Record<McpStatus['status'], { label: string; dot: string }> = {
  connected: { label: '已连接', dot: 'bg-green-500' },
  pending: { label: '连接中', dot: 'bg-amber-400' },
  'needs-auth': { label: '需要授权', dot: 'bg-amber-400' },
  failed: { label: '连接失败', dot: 'bg-danger' },
  disabled: { label: '已停用', dot: 'bg-fg3' }
}

function matches(skill: SkillInfo, query: string): boolean {
  return !query || skill.name.toLowerCase().includes(query) || skill.description.toLowerCase().includes(query)
}

/** 分组标题已经说明了来源，卡片上去掉 plugin: 前缀 */
function shortName(skill: SkillInfo): string {
  return skill.source === 'plugin' || skill.source === 'synced' ? skill.name.slice(skill.name.indexOf(':') + 1) : skill.name
}

function Badge({ tone = 'muted', children }: { tone?: 'muted' | 'accent' | 'danger'; children: React.ReactNode }) {
  const color = tone === 'accent' ? 'bg-accent/10 text-accent' : tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-chip text-fg3'
  return <span className={`shrink-0 rounded px-1.5 py-px text-[11px] ${color}`}>{children}</span>
}

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)
  return [copied, text => void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) })]
}

function SkillCard({ skill, onOpen }: { skill: SkillInfo; onOpen(): void }) {
  return <button type="button" onClick={onOpen} title={skill.description}
    className="group flex min-w-0 items-start gap-2.5 rounded-xl border border-line bg-card px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-hover/40">
    <span className="mt-px grid size-6 shrink-0 place-items-center rounded-md bg-chip text-fg2 group-hover:text-accent">
      {skill.kind === 'command' ? <SquareSlash size={13} /> : <Sparkles size={13} />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5">
        <span className="truncate font-mono text-[12.5px] text-fg">{shortName(skill)}</span>
        {skill.kind === 'command' && <Badge>命令</Badge>}
      </span>
      <span className="mt-0.5 line-clamp-2 text-[12px] leading-[1.5] text-fg3">{skill.description || '没有描述'}</span>
    </span>
  </button>
}

function SkillGrid({ skills, onOpen }: { skills: SkillInfo[]; onOpen(skill: SkillInfo): void }) {
  return <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{skills.map(s => <SkillCard key={s.path} skill={s} onOpen={() => onOpen(s)} />)}</div>
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <section className="mt-7">
    <div className="mb-2.5 flex items-baseline gap-2">
      <h2 className="text-[13px] font-medium">{title}</h2>
      <span className="text-[12px] tabular-nums text-fg3">{count}</span>
    </div>
    {children}
  </section>
}

function PluginCard({ plugin, skills, forceOpen, busy, onToggle, onOpen }: { plugin: PluginInfo; skills: SkillInfo[]; forceOpen: boolean; busy: boolean; onToggle(enabled: boolean): void; onOpen(skill: SkillInfo): void }) {
  const [open, setOpen] = useState(plugin.enabled)
  const expanded = forceOpen || open
  const commandCount = skills.filter(s => s.kind === 'command').length
  const summary = [skills.length - commandCount && `${skills.length - commandCount} 个技能`, commandCount && `${commandCount} 个命令`].filter(Boolean).join(' · ') || '无技能'
  return <div className="rounded-xl border border-line bg-card">
    <div className="flex items-center gap-3 px-3.5 py-3">
      <button type="button" aria-expanded={expanded} onClick={() => setOpen(!expanded)} title={plugin.description} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${plugin.enabled ? 'bg-accent/10 text-accent' : 'bg-chip text-fg3'}`}><Puzzle size={16} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={`truncate text-[14px] font-medium ${plugin.enabled ? '' : 'text-fg2'}`}>{plugin.name}</span>
            {plugin.version && <span className="shrink-0 text-[12px] text-fg3">v{plugin.version}</span>}
            {plugin.projectOverride && <Badge>项目设置</Badge>}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-fg3">{summary}</span>
        </span>
        {skills.length > 0 && <span className="shrink-0 text-fg3">{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>}
      </button>
      <IconButton label="在访达中显示" onClick={() => void window.desk.projects.revealInFinder(plugin.path)}><FolderOpen size={14} /></IconButton>
      <Toggle label={`启用 ${plugin.name}`} value={plugin.enabled} disabled={busy || plugin.projectOverride}
        title={plugin.projectOverride ? '当前项目的设置已指定此插件的启用状态' : '新开的对话生效'} onChange={onToggle} />
    </div>
    {expanded && skills.length > 0 && <div className={`border-t border-line p-2.5 ${plugin.enabled ? '' : 'opacity-70'}`}><SkillGrid skills={skills} onOpen={onOpen} /></div>}
  </div>
}

function SkillDetail({ skill, plugin, onClose, onUse }: { skill: SkillInfo; plugin?: PluginInfo; onClose(): void; onUse(): void }) {
  const [body, setBody] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, copy] = useCopy()
  useEffect(() => {
    let cancelled = false
    window.desk.skills.read(skill.path).then(text => { if (!cancelled) setBody(text) }, e => { if (!cancelled) setError(errorText(e)) })
    return () => { cancelled = true }
  }, [skill.path])
  return <Dialog title={`/${skill.name}`} width={680} onClose={onClose} footer={<>
    <Button onClick={() => void window.desk.projects.revealInFinder(skill.path)}>在访达中显示</Button>
    <Button onClick={() => copy(`/${skill.name}`)}>{copied ? '已复制' : '复制命令'}</Button>
    <Button variant="primary" onClick={onUse}>在新对话中使用</Button>
  </>}>
    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
      <Badge tone="accent">{SOURCE_LABEL[skill.source]}</Badge>
      <Badge>{skill.kind === 'command' ? '命令' : '技能'}</Badge>
      {plugin && <Badge>{plugin.name}{plugin.enabled ? '' : '（未启用）'}</Badge>}
      <span className="min-w-0 truncate font-mono text-[11.5px] text-fg3" title={skill.path}>{skill.path}</span>
    </div>
    {skill.description && <p className="mt-3 rounded-lg bg-chip/60 px-3 py-2 text-[12.5px] leading-relaxed text-fg2">{skill.description}</p>}
    <div className="mt-3 text-[13px] text-fg">
      {error ? <p role="alert" className="text-danger">{error}</p> : body === null ? <p role="status" className="text-fg3">读取中…</p> : body ? <Markdown text={body} /> : <p className="text-fg3">文件没有正文。</p>}
    </div>
  </Dialog>
}

function SkillsTab({ catalog, query, filter, busy, onTogglePlugin, onOpen }: { catalog: SkillCatalog; query: string; filter: Filter; busy: string | null; onTogglePlugin(plugin: PluginInfo, enabled: boolean): void; onOpen(skill: SkillInfo): void }) {
  const visible = catalog.skills.filter(s => matches(s, query))
  const groups = SOURCES.filter(s => s.value !== 'plugin' && (filter === 'all' || filter === s.value))
    .map(source => ({ source, skills: visible.filter(s => s.source === source.value) }))
    .filter(g => g.skills.length > 0)
  const plugins = filter === 'all' || filter === 'plugin'
    ? catalog.plugins.map(plugin => ({ plugin, skills: visible.filter(s => s.plugin === plugin.id) }))
      .filter(p => !query || p.skills.length > 0 || p.plugin.name.toLowerCase().includes(query))
      .sort((a, b) => Number(b.plugin.enabled) - Number(a.plugin.enabled) || a.plugin.name.localeCompare(b.plugin.name))
    : []
  if (!groups.length && !plugins.length) return <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
    <SkillsIcon size={36} className="text-fg3" />
    <div className="text-[14px]">{query ? '没有匹配的技能' : '还没有可用的技能'}</div>
    {!query && <div className="text-[12px] text-fg3">在 ~/.claude/skills/&lt;名称&gt;/SKILL.md 中创建技能，或通过 /plugin 安装插件。</div>}
  </div>
  return <>
    {groups.map(({ source, skills }) => <Group key={source.value} title={source.label} count={skills.length}><SkillGrid skills={skills} onOpen={onOpen} /></Group>)}
    {plugins.length > 0 && <Group title="插件" count={plugins.length}>
      <div className="flex flex-col gap-2.5">{plugins.map(p => <PluginCard key={p.plugin.id} plugin={p.plugin} skills={p.skills} forceOpen={!!query} busy={busy === p.plugin.id}
        onToggle={enabled => onTogglePlugin(p.plugin, enabled)} onOpen={onOpen} />)}</div>
    </Group>}
  </>
}

type McpOperation = 'enable' | 'disable' | 'reconnect'

function McpTab({ list, error, query, busy, onAction }: { list: McpStatus[] | null; error: string | null; query: string; busy: Record<string, McpOperation>; onAction(name: string, operation: McpOperation): void }) {
  if (error && !list) return <div role="alert" className="mt-6 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>
  if (!list) return <div role="status" className="mt-6 flex flex-col gap-2">{[0, 1, 2].map(i => <div key={i} className="h-[52px] animate-pulse rounded-xl bg-chip/70" />)}</div>
  const visible = list.filter(s => !query || s.name.toLowerCase().includes(query))
  if (!visible.length) return <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
    <Server size={32} className="text-fg3" />
    <div className="text-[14px]">{query ? '没有匹配的 MCP 服务' : '没有配置 MCP 服务器'}</div>
    {!query && <div className="text-[12px] text-fg3">可在终端运行 claude mcp add 添加，或在项目根目录创建 .mcp.json。</div>}
  </div>
  const scopes = [...new Set(visible.map(s => s.scope ?? 'other'))]
  return <>
    <div className="mt-5 grid grid-cols-3 gap-2.5">
      {[['服务器', list.length], ['已连接', list.filter(s => s.status === 'connected').length], ['工具总数', list.reduce((n, s) => n + s.tools, 0)]].map(([label, value]) =>
        <div key={label} className="rounded-xl border border-line bg-card px-4 py-3"><div className="text-[12px] text-fg3">{label}</div><div className="mt-1 text-[20px] tabular-nums">{value}</div></div>)}
    </div>
    {error && <div role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}
    {scopes.map(scope => {
      const servers = visible.filter(s => (s.scope ?? 'other') === scope)
      return <Group key={scope} title={MCP_SCOPES[scope] ?? (scope === 'other' ? '其他' : scope)} count={servers.length}>
        <div className="divide-y divide-line rounded-xl border border-line bg-card">{servers.map(server => {
          const pending = busy[server.name]
          const status = pending ? { label: pending === 'reconnect' ? '重连中' : pending === 'enable' ? '启用中' : '停用中', dot: '' } : MCP_STATUS[server.status] ?? { label: server.status, dot: 'bg-fg3' }
          const enabled = pending ? pending !== 'disable' : server.status !== 'disabled'
          return <div key={server.name} className="px-3.5 py-3">
            <div className="flex items-center gap-3">
              <span className={`grid size-7 shrink-0 place-items-center rounded-lg bg-chip ${enabled ? 'text-fg2' : 'text-fg3'}`}><Server size={14} /></span>
              <span className={`min-w-0 flex-1 truncate font-mono text-[13px] ${enabled ? '' : 'text-fg3'}`}>{server.name}</span>
              {server.status !== 'disabled' && <span className="text-[12px] tabular-nums text-fg3">{server.tools} 个工具</span>}
              <span className="flex w-[72px] shrink-0 items-center justify-end gap-1.5 text-[12px] text-fg2">
                {pending ? <LoaderCircle size={12} className="animate-spin text-fg3" /> : <span className={`size-1.5 rounded-full ${status.dot}`} />}{status.label}
              </span>
              <span className={server.status === 'disabled' || pending ? 'invisible' : ''}>
                <IconButton label={`重新连接 ${server.name}`} onClick={() => onAction(server.name, 'reconnect')}><RotateCw size={14} /></IconButton>
              </span>
              <Toggle label={`启用 ${server.name}`} value={enabled} disabled={!!pending} title="新开的对话生效" onChange={on => onAction(server.name, on ? 'enable' : 'disable')} />
            </div>
            {server.error && <p className="mt-1.5 break-words pl-10 text-[12px] text-danger">{server.error}</p>}
          </div>
        })}</div>
      </Group>
    })}
  </>
}

export function SkillsPage() {
  const view = useDesk(s => s.view)
  const setView = useDesk(s => s.setView)
  const newChat = useDesk(s => s.newChat)
  const projects = useDesk(s => s.projects)
  const home = useDesk(s => s.home)
  const tab: Tab = view.kind === 'skills' && view.tab === 'mcp' ? 'mcp' : 'skills'
  const [projectId, setProjectId] = useState((view.kind === 'skills' && view.projectId) || '')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [detail, setDetail] = useState<SkillInfo | null>(null)
  const [mcp, setMcp] = useState<{ cwd: string; list: McpStatus[] | null; error: string | null } | null>(null)
  const [mcpBusy, setMcpBusy] = useState<Record<string, McpOperation>>({})
  const [creating, setCreating] = useState(false)
  const [revision, setRevision] = useState(0)
  const project = projects.find(p => p.id === projectId)
  const cwd = project?.path ?? home

  useEffect(() => {
    let cancelled = false
    window.desk.skills.list(project?.path ?? null).then(value => { if (!cancelled) { setCatalog(value); setError(null) } }, e => { if (!cancelled) setError(errorText(e)) })
    return () => { cancelled = true }
  }, [project?.path, revision])

  // MCP 需要启动一次 Claude Code 进程，只在切到该页时读取
  useEffect(() => {
    if (tab !== 'mcp') return
    let cancelled = false
    setMcp({ cwd, list: null, error: null })
    window.desk.chat.mcp(null, cwd).then(list => { if (!cancelled) setMcp({ cwd, list, error: null }) }, e => { if (!cancelled) setMcp({ cwd, list: null, error: errorText(e) }) })
    return () => { cancelled = true }
  }, [tab, cwd, revision])

  const counts = useMemo(() => {
    const skills = catalog?.skills ?? []
    return Object.fromEntries(SOURCES.map(s => [s.value, s.value === 'plugin' ? catalog?.plugins.length ?? 0 : skills.filter(k => k.source === s.value).length])) as Record<SkillSource, number>
  }, [catalog])
  // 没有内容的来源不出现在筛选里；选中的来源消失时回到全部
  const filters = SOURCES.filter(s => counts[s.value] > 0)
  const activeFilter = filter === 'all' || counts[filter] > 0 ? filter : 'all'

  const togglePlugin = (plugin: PluginInfo, enabled: boolean): void => {
    setBusy(plugin.id); setError(null)
    window.desk.skills.setPluginEnabled(plugin.id, enabled)
      .then(() => window.desk.skills.list(project?.path ?? null)).then(setCatalog)
      .catch(e => setError(errorText(e))).finally(() => setBusy(null))
  }
  const mcpAction = (name: string, operation: McpOperation): void => {
    const target = cwd
    setMcpBusy(b => ({ ...b, [name]: operation }))
    setMcp(m => m && { ...m, error: null })
    window.desk.chat.mcpAction(target, operation, name)
      .then(list => setMcp(m => m?.cwd === target ? { cwd: target, list, error: null } : m))
      .catch(e => setMcp(m => {
        if (m?.cwd !== target) return m
        // 服务器行里已有同样的错误时，横幅只说明是哪个操作失败
        const detail = errorText(e), shown = m.list?.find(s => s.name === name)?.error
        const label = { enable: '启用', disable: '停用', reconnect: '重新连接' }[operation]
        return { ...m, error: `${label}「${name}」失败${shown && detail.includes(shown) ? '' : `：${detail}`}` }
      }))
      .finally(() => setMcpBusy(({ [name]: _, ...rest }) => rest))
  }
  const creator = catalog?.skills.find(s => s.kind === 'skill' && s.name.endsWith('skill-creator') && (!s.plugin || catalog.plugins.find(p => p.id === s.plugin)?.enabled))?.name
  const useSkill = (skill: SkillInfo): void => {
    setDetail(null)
    newChat(project?.id, `/${skill.name} `)
  }
  const q = query.trim().toLowerCase()
  const mcpCount = mcp?.cwd === cwd ? mcp.list?.length : undefined

  return <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-12 sm:px-10">
    <div className="mx-auto max-w-[820px]">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <h1 className="font-serif text-[24px]">技能与插件</h1>
        <div className="flex items-center gap-2">
          <select aria-label="项目" value={projectId} onChange={e => setProjectId(e.target.value)} className={`${settingsInputClass} w-[160px]`}>
            <option value="">用户目录</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <IconButton label="刷新" size="md" onClick={() => setRevision(n => n + 1)}><RefreshCw size={15} /></IconButton>
          <button type="button" onClick={() => setCreating(true)} className="flex h-9 items-center gap-1.5 rounded-lg bg-chip px-3 text-[13px] hover:bg-active"><Plus size={14} />新建技能</button>
        </div>
      </div>

      <div className="sticky top-0 z-10 -mx-1 mt-4 bg-bg px-1 pb-1 pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="技能与插件分类" className="flex rounded-lg bg-chip p-0.5">
            {([['skills', 'Skill', catalog?.skills.length], ['mcp', 'MCP', mcpCount]] as const).map(([value, label, count]) =>
              <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setView({ kind: 'skills', tab: value })}
                className={`flex items-center gap-1.5 rounded-md px-4 py-1 text-[13px] transition-colors ${tab === value ? 'bg-card text-fg shadow-sm' : 'text-fg2 hover:text-fg'}`}>
                {label}{count !== undefined && <span className="text-[11.5px] tabular-nums text-fg3">{count}</span>}
              </button>)}
          </div>
          <label className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-line bg-card px-2.5 text-fg3 focus-within:border-line-strong">
            <Search size={14} className="shrink-0" />
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
              placeholder={tab === 'skills' ? '搜索技能名称或描述' : '搜索 MCP 服务'} className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg3" />
          </label>
        </div>
        {tab === 'skills' && filters.length > 1 && <div className="mt-2.5 flex flex-wrap gap-1">
          {([{ value: 'all', label: '全部' }, ...filters] as { value: Filter; label: string }[]).map(f =>
            <button key={f.value} type="button" aria-pressed={activeFilter === f.value} onClick={() => setFilter(f.value)}
              className={`rounded-full px-3 py-1 text-[12px] ${activeFilter === f.value ? 'bg-active text-fg' : 'text-fg2 hover:bg-hover'}`}>
              {f.label}{f.value !== 'all' && <span className="ml-1 tabular-nums text-fg3">{counts[f.value]}</span>}
            </button>)}
        </div>}
      </div>

      {tab === 'skills' && <>
        {error && <div role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}
        {!catalog && !error && <div role="status" className="mt-6 grid grid-cols-1 gap-2 md:grid-cols-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-[66px] animate-pulse rounded-xl bg-chip/70" />)}</div>}
        {catalog && <SkillsTab catalog={catalog} query={q} filter={activeFilter} busy={busy} onTogglePlugin={togglePlugin} onOpen={setDetail} />}
      </>}
      {tab === 'mcp' && <McpTab list={mcp?.cwd === cwd ? mcp.list : null} error={mcp?.cwd === cwd ? mcp.error : null} query={q} busy={mcpBusy} onAction={mcpAction} />}
    </div>
    {creating && <NewSkillDialog projects={projects} projectId={projectId} creator={creator} onClose={() => setCreating(false)}
      onSubmit={(prompt, target) => { setCreating(false); newChat(target, prompt) }} />}
    {detail && <SkillDetail skill={detail} plugin={catalog?.plugins.find(p => p.id === detail.plugin)} onClose={() => setDetail(null)} onUse={() => useSkill(detail)} />}
  </div>
}
