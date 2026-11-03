import { useEffect, useState } from 'react'
import { useComposerDrafts } from '../../composerDraftStore'

import { Trash2 } from 'lucide-react'

const behaviors: Record<string, string> = { allow: '允许', ask: '询问', deny: '拒绝' }
const scopes: Record<string, string> = { userSettings: '用户', localSettings: '本地项目', projectSettings: '共享项目', policySettings: '组织策略', flagSettings: '启动参数' }

interface Task {
  task_id: string
  task_type?: string
  description?: string
  status?: string
}
interface Rule {
  rule: string
  behavior: string
  source: string
  editability: string
}

export function SessionControlsPane({ sessionId, cwd, active, turnDiff, initialTab = 'diff' }: {
  sessionId: string
  cwd: string
  active: boolean
  turnDiff?: string
  initialTab?: string
}) {
  const [addingRule, setAddingRule] = useState(false)
  const [tab, setTab] = useState(initialTab)
  const [source, setSource] = useState(turnDiff ? 'turn' : 'working')
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [output, setOutput] = useState('')

  useEffect(() => {
    if (!active) return
    let cancelled = false
    let loading = false
    setData(null)
    setError('')
    async function load() {
      if (loading) return
      loading = true
      try {
        const value = tab === 'diff' && source === 'turn'
          ? turnDiff ?? ''
          : await window.desk.chat.control(sessionId, cwd, tab, tab === 'diff' ? source : undefined)
        if (!cancelled) setData(value)
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally { loading = false }
    }
    void load()
    const timer = tab === 'tasks' ? setInterval(load, 2000) : undefined
    return () => { cancelled = true; clearInterval(timer) }
  }, [sessionId, cwd, tab, source, revision, active, turnDiff])

  async function taskAction(operation: string, id: string) {
    setBusy(true)
    setError('')
    try {
      const value = await window.desk.chat.control(sessionId, cwd, operation, id)
      if (operation === 'taskOutput') setOutput(value?.output ?? value?.response?.output ?? '暂无输出')
      setRevision(r => r + 1)
    } catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }

  async function changeRule(change: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      await window.desk.chat.control(sessionId, cwd, 'changeRule', JSON.stringify(change))
      if (!change.remove) setAddingRule(false)
      setRevision(r => r + 1)
    } catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }

  function attachDiff() {
    const drafts = useComposerDrafts.getState()
    const text = drafts.drafts[sessionId]?.text ?? ''
    drafts.updateDraft(sessionId, { text: text + '\n请审阅以下差异\n' + data })
  }

  const rules: Rule[] = data?.state?.rules ?? data?.response?.state?.rules ?? []
  const tasks: Task[] = Array.isArray(data) ? data : []
  const buttonStyle = 'rounded-lg bg-chip px-3 py-1.5 disabled:opacity-40'
  return <div className="h-full overflow-y-auto p-4 text-[13px]">
    <nav className="mb-4 flex flex-wrap gap-1 border-b border-line pb-3">
      {[['diff', '改动审阅'], ['tasks', '后台任务'], ['rules', '权限规则']].map(([value, label]) =>
        <button key={value} onClick={() => { setTab(value); setOutput('') }}
          className={`rounded-lg px-3 py-2 ${tab === value ? 'bg-active' : 'hover:bg-hover'}`}>{label}</button>)}
    </nav>
    <button onClick={() => setRevision(r => r + 1)} className={buttonStyle}>刷新</button>
    {error && <p role="alert" className="my-3 text-danger">{error}</p>}
    {tab === 'diff' && <>
      <select aria-label="比较来源" value={source} onChange={e => setSource(e.target.value)}
        className="mb-3 ml-2 max-w-full rounded-lg border border-line bg-bg p-1.5">
        {turnDiff && <option value="turn">本轮工具修改片段</option>}
        <option value="working">工作区相对 HEAD</option>
        <option value="branch">分支相对基准分支</option>
      </select>
      {typeof data === 'string' && <>
        <button disabled={!data} className={buttonStyle} onClick={attachDiff}>附到下一条提问</button>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-line p-3 font-mono text-[12px]">
          {data ? data.split('\n').map((line, index) => <div key={index}
            className={line.startsWith('+') ? 'text-green-600 dark:text-green-400' : line.startsWith('-') ? 'text-danger' : 'text-fg2'}>{line || ' '}</div>) : '没有已跟踪文件的差异'}
        </pre>
      </>}
    </>}
    {tab === 'tasks' && Array.isArray(data) && <div className="mt-3 divide-y divide-line rounded-xl border border-line">
      {!tasks.length && <p className="p-3 text-fg3">暂无任务</p>}
      {tasks.map(task => <div key={task.task_id} className="p-3">
        <div>{task.description ?? task.task_id}</div>
        <div className="my-2 text-[12px] text-fg3">{task.task_type} · {task.status}</div>
        <button disabled={busy} onClick={() => void taskAction('taskOutput', task.task_id)} className={buttonStyle}>查看输出</button>
        {task.status === 'running' && <button disabled={busy} onClick={() => void taskAction('stopTask', task.task_id)}
          className={buttonStyle + ' ml-2 text-danger'}>停止此任务</button>}
      </div>)}
    </div>}
    {output && <pre className="mt-3 whitespace-pre-wrap break-all rounded-xl border border-line p-3 text-[12px]">{output}</pre>}
    {tab === 'rules' && data && <>
      <button aria-expanded={addingRule} onClick={() => setAddingRule(!addingRule)} className={buttonStyle + ' ml-2'}>{addingRule ? '取消新增' : '新增规则'}</button>
      {addingRule && <form className="my-3 flex flex-wrap gap-2" onSubmit={event => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        void changeRule({ source: form.get('source'), behavior: form.get('behavior'), rule: form.get('rule') })
      }}>
        <select name="source" aria-label="保存范围" className="rounded-lg border border-line bg-bg p-2">
          <option value="localSettings">本地项目</option><option value="projectSettings">共享项目</option><option value="userSettings">用户</option>
        </select>
        <select name="behavior" aria-label="权限行为" className="rounded-lg border border-line bg-bg p-2">
          {Object.entries(behaviors).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input required name="rule" aria-label="权限规则" placeholder="Bash(npm run *)" className="min-w-0 flex-1 rounded-lg border border-line bg-bg p-2" />
        <button disabled={busy} className={buttonStyle}>保存规则</button>
      </form>}
      <div className="mb-2 mt-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">生效规则</h3>
        {rules.some(rule => rule.editability === 'session') &&
          <button disabled={busy} title="重载配置并清除本会话临时授权" className="rounded-md px-2 py-1 text-fg2 hover:bg-hover disabled:opacity-40"
            onClick={() => void taskAction('reloadConfiguration', '')}>清除本会话临时授权</button>}
      </div>
      <div className="divide-y divide-line rounded-xl border border-line">
        {!rules.length && <p className="p-3 text-fg3">没有规则</p>}
        {rules.map((rule, index) => <div key={index} className="flex items-center gap-2 px-3 py-2.5">
          <span className={`shrink-0 font-medium ${rule.behavior === 'deny' ? 'text-danger' : 'text-fg'}`}>{behaviors[rule.behavior] ?? rule.behavior}</span>
          <code className="min-w-0 flex-1 break-all">{rule.rule}</code>
          <span className="text-right text-fg2" title={rule.source}>{rule.editability === 'session' ? '本会话' : scopes[rule.source] ?? rule.source}{rule.editability === 'readonly' && '（只读）'}</span>
          {rule.editability === 'persistent' && <button disabled={busy} aria-label={`撤销规则 ${rule.rule}`} title="撤销规则"
            onClick={() => void changeRule({ source: rule.source, behavior: rule.behavior, rule: rule.rule, remove: true })}
            className="shrink-0 rounded-md p-1.5 text-fg3 hover:bg-hover hover:text-danger"><Trash2 size={15} /></button>}
        </div>)}
      </div>
    </>}
  </div>
}
