import { useEffect, useMemo, useState } from 'react'
import { Clock, Ellipsis, Folder, Plus, ShieldCheck } from 'lucide-react'
import type { PermissionMode } from '@shared/types'
import { PERMISSION_MODES } from '@shared/format'
import { describeSchedule, MIN_INTERVAL_MINUTES, nextRunAt, validateSchedule, WEEKDAY_LABELS, type Schedule, type ScheduledTask, type ScheduledTaskInput } from '@shared/schedules'
import { useDesk } from '../../store'
import { errorText } from '../../ipcError'
import { Button, Dialog } from '../ui/Dialog'
import { Menu } from '../ui/Menu'
import { IconButton } from '../sidebar/SessionRow'
import { settingsInputClass, Toggle } from '../settings/SettingsControls'
import { ScheduleIcon } from './ScheduleIcon'

export function formatRunTime(at: number, now = Date.now()): string {
  const date = new Date(at)
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  const today = new Date(now)
  const days = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000)
  if (days === 0) return `今天 ${time}`
  if (days === 1) return `明天 ${time}`
  if (days === -1) return `昨天 ${time}`
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}

/** 距离 at 还有多久，只在 24 小时内显示，例如「2 分钟后」「3 小时后」 */
export function formatUntil(at: number, now = Date.now()): string | null {
  const minutes = Math.ceil((at - now) / 60_000)
  if (minutes <= 0) return '即将运行'
  if (minutes < 60) return `${minutes} 分钟后`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours} 小时后` : null
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function MetaChip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md bg-chip px-1.5 py-0.5 text-fg2">{icon}<span className="truncate">{children}</span></span>
}

function TaskCard({ task, now, projectName, onToggle, onRunNow, onEdit, onRemove, onOpenSession }: {
  task: ScheduledTask
  now: number
  projectName?: string
  onToggle(enabled: boolean): void
  onRunNow(): void
  onEdit(): void
  onRemove(): void
  onOpenSession(): void
}) {
  const run = task.lastRun
  const next = task.enabled && task.nextRunAt ? task.nextRunAt : null
  const until = next ? formatUntil(next, now) : null
  const status = !run ? null : run.error ? { dot: 'bg-danger', text: `失败：${run.error}`, tone: 'text-danger' } : run.skipped ? { dot: 'bg-amber-400', text: run.skipped, tone: 'text-fg3' } : { dot: 'bg-green-500', text: '已运行', tone: 'text-fg3' }
  const showPrompt = task.prompt.trim() !== task.name.trim()

  return <div className={`rounded-xl border border-line bg-card transition-colors hover:border-line-strong ${task.enabled ? '' : 'opacity-70'}`}>
    <div className="flex items-start gap-3 px-4 pt-3.5">
      <div className={`grid size-9 shrink-0 place-items-center rounded-lg ${task.enabled ? 'bg-accent/10 text-accent' : 'bg-chip text-fg3'}`}>
        <ScheduleIcon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium">{task.name}</span>
          {!task.enabled && <span className="shrink-0 rounded bg-chip px-1.5 py-px text-[11px] text-fg3">已暂停</span>}
          {run?.error && <span className="shrink-0 rounded bg-danger/10 px-1.5 py-px text-[11px] text-danger">上次失败</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11.5px]">
          <MetaChip icon={<Clock size={12} className="shrink-0" />}>{describeSchedule(task.schedule)}</MetaChip>
          <MetaChip icon={<Folder size={12} className="shrink-0" />}>{projectName ?? task.projectPath}</MetaChip>
          <MetaChip icon={<ShieldCheck size={12} className="shrink-0" />}>{PERMISSION_MODES.find(m => m.value === task.mode)?.label ?? task.mode}</MetaChip>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-1.5">
        <Toggle label={`启用 ${task.name}`} value={task.enabled} onChange={onToggle} />
        <Menu
          align="right"
          width={160}
          trigger={({ toggle }) => <IconButton label="更多操作" onClick={toggle}><Ellipsis size={15} /></IconButton>}
          items={[
            { key: 'run', label: '立即运行', onSelect: onRunNow },
            { key: 'edit', label: '编辑', onSelect: onEdit },
            { key: 'remove', label: '删除', danger: true, separatorBefore: true, onSelect: onRemove }
          ]}
        />
      </div>
    </div>
    {showPrompt && <div className="mx-4 mt-3 line-clamp-2 whitespace-pre-wrap rounded-lg bg-chip/60 px-3 py-2 text-[12.5px] leading-relaxed text-fg2">{task.prompt}</div>}
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-[12px] text-fg3">
      <span>
        下次运行 {next ? <><span className="text-fg">{formatRunTime(next, now)}</span>{until && <span className="text-accent"> · {until}</span>}</> : <span className="text-fg2">已暂停</span>}
      </span>
      {run && status && <span className="ml-auto flex min-w-0 items-center gap-1.5" title={run.error ?? run.skipped}>
        <span className={`size-1.5 shrink-0 rounded-full ${status.dot}`} />
        <span className="shrink-0">上次 {formatRunTime(run.at, now)}</span>
        <span className={`truncate ${status.tone}`}>{status.text}</span>
        {run.sessionId && !run.error && projectName && <button type="button" className="shrink-0 text-accent hover:underline" onClick={onOpenSession}>查看对话</button>}
      </span>}
    </div>
  </div>
}

export function SchedulesPage() {
  const [tasks, setTasks] = useState<ScheduledTask[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ScheduledTask | 'new' | null>(null)
  const [removing, setRemoving] = useState<ScheduledTask | null>(null)
  const projects = useDesk(s => s.projects)
  const now = useNow(30_000)

  useEffect(() => {
    let disposed = false
    window.desk.schedules.list().then(list => { if (!disposed) setTasks(list) }, e => { if (!disposed) setError(errorText(e)) })
    const off = window.desk.schedules.onChanged(setTasks)
    return () => { disposed = true; off() }
  }, [])

  const act = (action: () => Promise<ScheduledTask[]>): void => {
    setError(null)
    action().then(setTasks, e => setError(errorText(e)))
  }

  const openSession = (task: ScheduledTask): void => {
    const project = projects.find(p => p.path === task.projectPath)
    if (project && task.lastRun?.sessionId) useDesk.getState().setView({ kind: 'session', sessionId: task.lastRun.sessionId, projectId: project.id })
  }

  return <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-12 sm:px-10">
    <div className="mx-auto max-w-[760px]">
      <div className="flex items-center justify-between pt-4">
        <h1 className="font-serif text-[24px]">定时任务</h1>
        <button type="button" disabled={!projects.length} onClick={() => setEditing('new')} className="flex items-center gap-1.5 rounded-lg bg-chip px-3 py-1.5 text-[13px] hover:bg-active disabled:opacity-50"><Plus size={14} />新建任务</button>
      </div>
      {error && <div role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}

      {tasks && tasks.length === 0 && <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
        <ScheduleIcon size={36} className="text-fg3" />
        <div className="text-[14px]">还没有定时任务</div>
        {!projects.length && <div className="text-[12px] text-fg3">先在侧栏添加项目，再创建定时任务。</div>}
        {projects.length > 0 && <Button variant="primary" onClick={() => setEditing('new')}>新建任务</Button>}
      </div>}

      {tasks && tasks.length > 0 && <div className="mt-5 flex flex-col gap-3">
        {tasks.map(task => <TaskCard key={task.id} task={task} now={now} projectName={projects.find(p => p.path === task.projectPath)?.name}
          onToggle={enabled => act(() => window.desk.schedules.setEnabled(task.id, enabled))}
          onRunNow={() => act(() => window.desk.schedules.runNow(task.id))}
          onEdit={() => setEditing(task)}
          onRemove={() => setRemoving(task)}
          onOpenSession={() => openSession(task)} />)}
      </div>}
    </div>

    {editing && <TaskEditor task={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={list => { setTasks(list); setEditing(null) }} />}
    {removing && <Dialog title="删除定时任务" onClose={() => setRemoving(null)} footer={<>
      <Button onClick={() => setRemoving(null)}>取消</Button>
      <Button variant="danger" onClick={() => { const id = removing.id; setRemoving(null); act(() => window.desk.schedules.remove(id)) }}>删除</Button>
    </>}>确定删除「{removing.name}」吗？已经生成的对话不会被删除。</Dialog>}
  </div>
}

const SCHEDULE_KINDS: { kind: Schedule['kind']; label: string }[] = [
  { kind: 'daily', label: '每天' }, { kind: 'weekly', label: '每周' }, { kind: 'interval', label: '间隔' }, { kind: 'cron', label: 'Cron' }
]

function TaskEditor({ task, onClose, onSaved }: { task: ScheduledTask | null; onClose(): void; onSaved(tasks: ScheduledTask[]): void }) {
  const { projects, settings, selectedProjectId } = useDesk()
  const [name, setName] = useState(task?.name ?? '')
  const [projectPath, setProjectPath] = useState(task?.projectPath ?? projects.find(p => p.id === selectedProjectId)?.path ?? projects[0]?.path ?? '')
  const [prompt, setPrompt] = useState(task?.prompt ?? '')
  const [kind, setKind] = useState<Schedule['kind']>(task?.schedule.kind ?? 'daily')
  const [time, setTime] = useState(task && 'time' in task.schedule ? task.schedule.time : '09:00')
  const [days, setDays] = useState<number[]>(task?.schedule.kind === 'weekly' ? task.schedule.days : [1, 2, 3, 4, 5])
  const [minutes, setMinutes] = useState(task?.schedule.kind === 'interval' ? task.schedule.minutes : 60)
  const [expression, setExpression] = useState(task?.schedule.kind === 'cron' ? task.schedule.expression : '0 9 * * 1-5')
  const [mode, setMode] = useState<PermissionMode>(task?.mode ?? settings?.defaultPermissionMode ?? 'default')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const schedule: Schedule = kind === 'interval' ? { kind, minutes } : kind === 'daily' ? { kind, time } : kind === 'weekly' ? { kind, days, time } : { kind, expression }
  const preview = useMemo(() => {
    try { validateSchedule(schedule); const next = nextRunAt(schedule, Date.now()); return next ? `下次运行：${formatRunTime(next)}` : '找不到下一次运行时间' }
    catch (e) { return errorText(e) }
  }, [JSON.stringify(schedule)])
  const modes = PERMISSION_MODES.filter(m => m.value !== 'bypassPermissions' || settings?.allowBypass || mode === m.value)

  const save = (): void => {
    const input: ScheduledTaskInput = { name, projectPath, prompt, schedule, mode, enabled: task?.enabled ?? true }
    setSaving(true)
    setError(null)
    ;(task ? window.desk.schedules.update(task.id, input) : window.desk.schedules.create(input))
      .then(onSaved, e => setError(errorText(e)))
      .finally(() => setSaving(false))
  }

  const label = 'mb-1 block text-[12px] font-medium text-fg2'
  return <Dialog title={task ? '编辑定时任务' : '新建定时任务'} width={520} onClose={onClose} footer={<>
    <Button onClick={onClose}>取消</Button>
    <Button variant="primary" disabled={saving || !name.trim() || !prompt.trim() || !projectPath} onClick={save}>{saving ? '保存中…' : '保存'}</Button>
  </>}>
    <div className="flex flex-col gap-4 pt-1 text-fg">
      <label><span className={label}>名称</span>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="例如：每日提交汇总" className={`${settingsInputClass} w-full`} />
      </label>
      <label><span className={label}>项目</span>
        <select value={projectPath} onChange={e => setProjectPath(e.target.value)} className={`${settingsInputClass} w-full`}>
          {projects.map(p => <option key={p.id} value={p.path}>{p.name}</option>)}
        </select>
      </label>
      <label><span className={label}>提示词</span>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} placeholder="到点后发送给 Claude 的内容" className="w-full resize-y rounded-lg border border-line bg-card px-2 py-1.5 text-[13px]" />
      </label>
      <div>
        <span className={label}>时间</span>
        <div className="mb-2 flex gap-1 rounded-lg bg-chip p-0.5">
          {SCHEDULE_KINDS.map(k => <button key={k.kind} type="button" aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}
            className={`flex-1 rounded-md py-1 text-[12.5px] ${kind === k.kind ? 'bg-card text-fg shadow-sm' : 'text-fg2 hover:text-fg'}`}>{k.label}</button>)}
        </div>
        {kind === 'weekly' && <div className="mb-2 flex gap-1">
          {[1, 2, 3, 4, 5, 6, 0].map(d => <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => setDays(days.includes(d) ? days.filter(x => x !== d) : [...days, d])}
            className={`h-8 flex-1 rounded-lg border text-[12px] ${days.includes(d) ? 'border-accent bg-accent/10 text-accent' : 'border-line text-fg2 hover:bg-hover'}`}>{WEEKDAY_LABELS[d].slice(1)}</button>)}
        </div>}
        {(kind === 'daily' || kind === 'weekly') && <input type="time" value={time} onChange={e => setTime(e.target.value)} className={settingsInputClass} />}
        {kind === 'interval' && <label className="flex items-center gap-2 text-[13px]">每
          <input type="number" min={MIN_INTERVAL_MINUTES} step={5} value={minutes} onChange={e => setMinutes(Number(e.target.value))} className={`${settingsInputClass} w-24`} />分钟
        </label>}
        {kind === 'cron' && <input value={expression} onChange={e => setExpression(e.target.value)} placeholder="分 时 日 月 周" className={`${settingsInputClass} w-full font-mono`} />}
        <div className="mt-1.5 text-[12px] text-fg3">{preview}</div>
      </div>
      <label><span className={label}>权限模式</span>
        <select value={mode} onChange={e => setMode(e.target.value as PermissionMode)} className={`${settingsInputClass} w-full`}>
          {modes.map(m => <option key={m.value} value={m.value}>{m.label} — {m.description}</option>)}
        </select>
      </label>
      {error && <div role="alert" className="text-[12.5px] text-danger">{error}</div>}
    </div>
  </Dialog>
}
