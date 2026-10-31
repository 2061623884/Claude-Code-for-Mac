import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import type { ApprovalRequest, Decision } from '@shared/chat'
import { toolNameZh, toolSummary } from '@shared/format'
import { Button } from '../ui/Dialog'
import { Markdown } from './Markdown'
import { ToolBody } from './ToolCard'

interface CardProps {
  request: ApprovalRequest
  total: number
  cwd?: string
  onDecide(decision: Decision): void
}

export function ApprovalCard(props: CardProps) {
  if (props.request.toolName === 'AskUserQuestion') return <QuestionCard {...props} />
  if (props.request.toolName === 'ExitPlanMode') return <PlanCard {...props} />
  return <PermissionCard {...props} />
}

function Shell({ title, total, children, footer }: { title: string; total: number; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border border-line-strong bg-card shadow-card">
      <div className="flex items-center gap-2 px-4 pt-3.5 text-[14px] font-medium">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {total > 1 && <span className="text-[12px] font-normal text-fg3">还有 {total - 1} 个待确认</span>}
      </div>
      <div className="max-h-[45vh] overflow-y-auto px-4 py-3">{children}</div>
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 pb-3.5">{footer}</div>
    </div>
  )
}

/** Enter 允许、Esc 拒绝；在输入框里打字时不触发 */
function useShortcuts(onEnter: () => void, onEscape: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement
      if (e.key === 'Escape') onEscape()
      else if (e.key === 'Enter' && !typing && !e.isComposing) onEnter()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onEnter, onEscape])
}

function PermissionCard({ request, total, cwd, onDecide }: CardProps) {
  const [feedback, setFeedback] = useState('')
  const deny = (): void => onDecide({ type: 'deny', message: feedback.trim() || undefined })
  useShortcuts(() => onDecide({ type: 'allow' }), deny)
  const summary = toolSummary(request.toolName, request.input, cwd)

  return (
    <Shell
      title={`Claude 想要${toolNameZh(request.toolName)}${summary ? `：${summary}` : ''}`}
      total={total}
      footer={
        <>
          <input
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="或者告诉 Claude 应该怎么做（可选）"
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 text-[13px] outline-none select-text focus:border-fg3"
          />
          <Button onClick={deny}>{feedback.trim() ? '拒绝并告知' : '拒绝'} <Kbd>Esc</Kbd></Button>
          {request.canAlwaysAllow && <Button onClick={() => onDecide({ type: 'allowAlways' })}>始终允许</Button>}
          <Button variant="primary" onClick={() => onDecide({ type: 'allow' })}>
            允许 <Kbd>↵</Kbd>
          </Button>
        </>
      }
    >
      {request.reason && <p className="mb-2 text-[12.5px] text-fg3">{request.reason}</p>}
      <div className="overflow-hidden rounded-xl border border-line">
        <ToolBody block={{ kind: 'tool', id: request.requestId, name: request.toolName, input: request.input }} />
      </div>
    </Shell>
  )
}

interface Question {
  question: string
  header?: string
  multiSelect?: boolean
  options: { label: string; description?: string }[]
}

function QuestionCard({ request, total, onDecide }: CardProps) {
  const questions = (request.input.questions as Question[] | undefined) ?? []
  // 多个问题时一次只显示一个，避免后面的问题藏在卡片下方看不到
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [other, setOther] = useState<Record<string, string>>({})

  const answerOf = (q: Question, p = picked): string =>
    [...(p[q.question] ?? []), other[q.question]?.trim()].filter(Boolean).join(', ')
  const answers = Object.fromEntries(questions.map((q) => [q.question, answerOf(q)]))
  const firstUnanswered = questions.findIndex((q) => !answers[q.question])
  const unanswered = questions.filter((q) => !answers[q.question]).length
  const last = questions.length - 1
  const q = questions[Math.min(step, last)]

  const toggle = (label: string): void => {
    const current = picked[q.question] ?? []
    const next = q.multiSelect ? (current.includes(label) ? current.filter((l) => l !== label) : [...current, label]) : [label]
    const updated = { ...picked, [q.question]: next }
    setPicked(updated)
    // 单选题选完自动跳到下一个还没回答的问题
    if (!q.multiSelect) {
      const order = questions.map((_, k) => (step + 1 + k) % questions.length)
      const i = order.find((k) => k !== step && !answerOf(questions[k], updated))
      if (i !== undefined) setStep(i)
    }
  }
  const submit = (): void => {
    if (unanswered === 0) onDecide({ type: 'answers', answers })
    else setStep(firstUnanswered)
  }
  const skip = (): void => onDecide({ type: 'deny', message: '用户跳过了这些问题。' })
  useShortcuts(() => (step < last && answers[q.question] ? setStep(step + 1) : submit()), skip)

  if (!q) return null
  return (
    <Shell
      title={questions.length > 1 ? `Claude 想问你 ${questions.length} 个问题` : 'Claude 想问你一个问题'}
      total={total}
      footer={
        <>
          {unanswered > 0 && questions.length > 1 && <span className="mr-auto text-[12.5px] text-fg3">还有 {unanswered} 个问题未回答</span>}
          <Button onClick={skip}>跳过</Button>
          {step < last ? (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              下一题
            </Button>
          ) : (
            <Button variant="primary" onClick={submit}>
              提交
            </Button>
          )}
        </>
      }
    >
      {questions.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {questions.map((x, i) => (
            <button
              key={x.question}
              type="button"
              onClick={() => setStep(i)}
              className={`flex h-7 items-center gap-1 rounded-full px-3 text-[12.5px] ${
                i === step ? 'bg-accent text-accent-fg' : 'bg-chip text-fg2 hover:text-fg'
              }`}
            >
              {answers[x.question] && <Check size={12} />}
              {x.header || `问题 ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      <div className="mb-2 font-medium">
        {q.question}
        {q.multiSelect && <span className="ml-1 text-[12px] font-normal text-fg3">（可多选）</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        {q.options.map((o) => {
          const on = picked[q.question]?.includes(o.label)
          return (
            <button
              key={o.label}
              type="button"
              onClick={() => toggle(o.label)}
              className={`rounded-lg border px-3 py-2 text-left ${on ? 'border-fg bg-active' : 'border-line hover:bg-hover'}`}
            >
              <div>{o.label}</div>
              {o.description && o.description !== o.label && <div className="text-[12px] text-fg3">{o.description}</div>}
            </button>
          )
        })}
        <input
          value={other[q.question] ?? ''}
          onChange={(e) => setOther({ ...other, [q.question]: e.target.value })}
          placeholder="其他（自己填写）"
          className="h-9 rounded-lg border border-line bg-transparent px-3 outline-none select-text focus:border-fg3"
        />
      </div>
    </Shell>
  )
}

function PlanCard({ request, total, onDecide }: CardProps) {
  const [feedback, setFeedback] = useState('')
  const revise = (): void => onDecide({ type: 'planRevise', feedback: feedback.trim() || '请继续完善计划' })
  useShortcuts(() => onDecide({ type: 'planApprove', mode: 'default' }), revise)
  const plan = typeof request.input.plan === 'string' ? request.input.plan : ''

  return (
    <Shell
      title="计划已就绪，请审阅"
      total={total}
      footer={
        <>
          <input
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="需要修改的地方（可选）"
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 text-[13px] outline-none select-text focus:border-fg3"
          />
          <Button onClick={revise}>继续完善</Button>
          <Button onClick={() => onDecide({ type: 'planApprove', mode: 'acceptEdits' })}>批准并自动接受编辑</Button>
          <Button variant="primary" onClick={() => onDecide({ type: 'planApprove', mode: 'default' })}>
            批准，逐个确认
          </Button>
        </>
      }
    >
      <Markdown text={plan} />
    </Shell>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 text-[11px] opacity-60">{children}</span>
}
