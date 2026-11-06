import { useEffect, useMemo, useState } from 'react'
import { Ellipsis, Plus } from 'lucide-react'
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

export function SchedulesPage() {
  const [tasks, setTasks] = useState<ScheduledTask[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ScheduledTask | 'new' | null>(null)
  const [removing, setRemoving] = useState<ScheduledTask | null>(null)
  const projects = useDesk(s => s.projects)

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
        {tasks.map(task => {
          const project = projects.find(p => p.path === task.projectPath)
          const run = task.lastRun
          return <div key={task.id} className={`rounded-xl border border-line px-4 py-3 ${task.enabled ? '' : 'opacity-60'}`}>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{task.name}</div>
                <div className="mt-0.5 truncate text-[12px] text-fg3">{describeSchedule(task.schedule)} · {project?.name ?? task.projectPath} · {PERMISSION_MODES.find(m => m.value === task.mode)?.label ?? task.mode}</div>
              </div>
              <Toggle label={`启用 ${task.name}`} value={task.enabled} onChange={enabled => act(() => window.desk.schedules.setEnabled(task.id, enabled))} />
              <Menu
                align="right"
                width={160}
                trigger={({ toggle }) => <IconButton label="更多操作" onClick={toggle}><Ellipsis size={15} /></IconButton>}
                items={[
                  { key: 'run', label: '立即运行', onSelect: () => act(() => window.desk.schedules.runNow(task.id)) },
                  { key: 'edit', label: '编辑', onSelect: () => setEditing(task) },
                  { key: 'remove', label: '删除', danger: true, separatorBefore: true, onSelect: () => setRemoving(task) }
                ]}
              />
            </div>
            <div className="mt-2 line-clamp-2 whitespace-pre-wrap text-[12.5px] text-fg2">{task.prompt}</div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg3">
              <span>下次运行：{task.enabled && task.nextRunAt ? formatRunTime(task.nextRunAt) : '已暂停'}</span>
              {run && <span className={run.error ? 'text-danger' : ''}>
                上次：{formatRunTime(run.at)}{run.error ? ` 失败（${run.error}）` : run.skipped ? `（${run.skipped}）` : ''}
                {run.sessionId && !run.error && project && <button type="button" className="ml-1.5 text-accent hover:underline" onClick={() => openSession(task)}>查看对话</button>}
              </span>}
            </div>
          </div>
        })}
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
