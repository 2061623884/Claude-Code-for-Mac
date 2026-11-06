import { useState } from 'react'
import type { Project } from '@shared/types'
import { buildSkillPrompt, SKILL_NAME_PATTERN, type SkillDraft } from '@shared/skills'
import { Button, Dialog } from '../ui/Dialog'
import { settingsInputClass } from '../settings/SettingsControls'

const fieldClass = `${settingsInputClass} w-full px-2.5`
const areaClass = 'w-full resize-none rounded-lg border border-line bg-card px-2.5 py-2 text-[13px] leading-relaxed outline-none placeholder:text-fg3 focus:border-line-strong'

function Field({ label, optional, error, children }: { label: string; optional?: boolean; error?: string | null; children: React.ReactNode }) {
  return <label className="block">
    <span className="mb-1.5 flex items-baseline gap-2"><span className="text-[13px] text-fg">{label}{optional && <span className="text-fg3">（可选）</span>}</span>{error && <span className="text-[12px] text-danger">{error}</span>}</span>
    {children}
  </label>
}

/** 整理技能需求成提示词，交给新对话里的 Claude 去写 SKILL.md */
export function NewSkillDialog({ projects, projectId, creator, onClose, onSubmit }: {
  projects: Project[]
  /** 页面当前选中的项目，作为默认 */
  projectId: string
  /** skill-creator 技能的调用名，没有安装时为空 */
  creator?: string
  onClose(): void
  onSubmit(prompt: string, projectId: string | undefined): void
}) {
  const [draft, setDraft] = useState<SkillDraft>({ name: '', purpose: '', trigger: '', details: '', location: projectId ? 'project' : 'user' })
  const [target, setTarget] = useState(projectId || projects[0]?.id || '')
  const [useCreator, setUseCreator] = useState(!!creator)
  const patch = (value: Partial<SkillDraft>): void => setDraft(d => ({ ...d, ...value }))
  const nameError = draft.name && !SKILL_NAME_PATTERN.test(draft.name) ? '只能用小写字母、数字和连字符' : null
  const needsProject = draft.location === 'project'
  const ready = SKILL_NAME_PATTERN.test(draft.name) && draft.name.length <= 64 && draft.purpose.trim() && (!needsProject || target)
  const prompt = ready ? buildSkillPrompt({ ...draft, creator: useCreator ? creator : undefined }) : ''

  return <Dialog title="新建技能" width={560} onClose={onClose} footer={<>
    <Button onClick={onClose}>取消</Button>
    <Button variant="primary" disabled={!ready} onClick={() => onSubmit(prompt, needsProject ? target : projectId || undefined)}>去新对话中创建</Button>
  </>}>
    <div className="mt-2 flex flex-col gap-3.5">
      <Field label="名称" error={nameError}>
        <input autoFocus value={draft.name} maxLength={64} onChange={e => patch({ name: e.target.value.toLowerCase().replace(/\s+/g, '-') })} placeholder="weekly-report" className={`${fieldClass} font-mono ${nameError ? 'border-danger' : ''}`} />
      </Field>
      <Field label="用途">
        <textarea rows={2} value={draft.purpose} onChange={e => patch({ purpose: e.target.value })} placeholder="根据本周的 git 提交和完成的任务，生成一份中文周报" className={areaClass} />
      </Field>
      <Field label="何时使用" optional>
        <input value={draft.trigger} onChange={e => patch({ trigger: e.target.value })} placeholder="当我说「写周报」「总结这周的工作」时" className={fieldClass} />
      </Field>
      <Field label="补充要求" optional>
        <textarea rows={3} value={draft.details} onChange={e => patch({ details: e.target.value })} placeholder={'按「完成 / 进行中 / 下周计划」三段输出\n每条不超过一行'} className={areaClass} />
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="保存位置">
          <div className="flex rounded-lg bg-chip p-0.5">
            {([['user', '个人'], ['project', '项目']] as const).map(([value, label]) =>
              <button key={value} type="button" title={value === 'user' ? '所有项目可用' : '仅该项目可用'} aria-pressed={draft.location === value} disabled={value === 'project' && !projects.length} onClick={() => patch({ location: value })}
                className={`rounded-md px-3.5 py-1 text-[13px] disabled:opacity-40 ${draft.location === value ? 'bg-card text-fg shadow-sm' : 'text-fg2 hover:text-fg'}`}>{label}</button>)}
          </div>
        </Field>
        {needsProject && <select aria-label="技能所属项目" value={target} onChange={e => setTarget(e.target.value)} className={`${settingsInputClass} w-[180px]`}>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>}
      </div>
      {creator && <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={useCreator} onChange={e => setUseCreator(e.target.checked)} className="accent-[var(--color-accent)]" />
        使用 <span className="font-mono text-[12.5px]">/{creator}</span> 辅助编写
      </label>}
      {prompt && <details className="rounded-lg border border-line">
        <summary className="cursor-pointer select-none px-3 py-2 text-[12.5px] text-fg2">预览提示词</summary>
        <pre className="max-h-[180px] overflow-y-auto whitespace-pre-wrap border-t border-line px-3 py-2 font-sans text-[12px] leading-relaxed text-fg2">{prompt}</pre>
      </details>}
    </div>
  </Dialog>
}
