import { useEffect, useState } from 'react'
import type { SummaryItem } from '@shared/sessionSummary'
import type { TaskOutput } from '@shared/taskOutput'
import { Markdown } from '../chat/Markdown'
import { ToolCard } from '../chat/ToolCard'
export function TaskActions({ item, sessionId, onOutput }: { item: SummaryItem; sessionId: string; onOutput(): void }) {
  const [stopping, setStopping] = useState(false),
    [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!item.execution?.canStop || item.status !== 'running') setStopping(false)
  }, [item.execution?.canStop, item.execution?.runId, item.status])
  useEffect(() => {
    if (!stopping) return
    const timer = setTimeout(() => {
      setStopping(false)
      setError('尚未收到停止确认，请检查任务状态后重试。')
    }, 15000)
    return () => clearTimeout(timer)
  }, [stopping])
  if (!item.execution) return null
  return (
    <div data-task-actions={item.id} className="mt-2 ml-6 text-xs">
      <div className="flex items-center gap-3">
        <span className="text-fg3">
          {item.execution.type === 'local_agent'
            ? '子 Agent'
            : item.execution.type === 'local_bash'
              ? '后台命令'
              : '执行任务'}
        </span>
        <button className="text-accent hover:underline" onClick={onOutput}>
          查看输出
        </button>
        {item.execution.canStop && (
          <button
            disabled={stopping}
            className="text-danger disabled:opacity-50"
            onClick={() => {
              setStopping(true)
              setError(null)
              void window.desk.tasks.stop(sessionId, item.id, item.execution?.runId).catch((e) => {
                setError(String(e))
                setStopping(false)
              })
            }}
          >
            {stopping ? '正在停止…' : '停止任务'}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
export function TaskOutputView({
  item,
  sessionId,
  cwd,
  active,
  onBack
}: {
  item: SummaryItem
  sessionId: string
  cwd: string
  active: boolean
  onBack(): void
}) {
  const [output, setOutput] = useState<TaskOutput | null>(null),
    [error, setError] = useState<string | null>(null),
    [offset, setOffset] = useState(0)
  useEffect(() => {
    if (!active) return
    let cancelled = false,
      timer: ReturnType<typeof setTimeout> | undefined
    const read = async () => {
      try {
        const value = await window.desk.tasks.output(sessionId, cwd, item.id, offset)
        if (!cancelled) {
          setOutput(value)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
      if (!cancelled && item.execution?.canStop) timer = setTimeout(read, 1500)
    }
    void read()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [sessionId, cwd, item.id, item.execution?.canStop, offset, active])
  return (
    <div className="p-5">
      <button onClick={onBack} className="mb-3 text-sm text-accent">
        ← 返回会话摘要
      </button>
      <h3 className="font-medium">{item.title}</h3>
      <TaskActions item={item} sessionId={sessionId} onOutput={() => setOffset(0)} />
      {error ? (
        <p role="alert" className="my-3 text-danger">
          {error}
        </p>
      ) : !output ? (
        <p>正在读取输出…</p>
      ) : (
        <>
          {output.unavailable && <p className="my-4 text-sm text-fg3">{output.unavailable}</p>}
          {output.text !== undefined && (
            <pre className="my-3 whitespace-pre-wrap break-words text-xs select-text">{output.text}</pre>
          )}
          {output.messages.map((message) => (
            <div key={message.id} className="my-3">
              {message.blocks.map((block, i) =>
                block.kind === 'text' ? (
                  <Markdown key={i} text={block.text} />
                ) : block.kind === 'tool' ? (
                  <ToolCard key={block.id} block={block} running={Boolean(item.execution?.canStop)} cwd={cwd} />
                ) : null
              )}
            </div>
          ))}
          {output.truncated && (
            <p className="text-xs text-fg3">当前输出较长，仅显示{output.nextOffset ? '本页' : '末尾 256 KB'}。</p>
          )}
          <div className="mt-3 flex gap-3 text-sm text-accent">
            {offset > 0 && <button onClick={() => setOffset(Math.max(0, offset - 100))}>上一页</button>}
            {output.nextOffset !== undefined && <button onClick={() => setOffset(output.nextOffset!)}>下一页</button>}
          </div>
        </>
      )}
    </div>
  )
}
