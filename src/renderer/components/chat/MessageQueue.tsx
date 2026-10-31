import { useRef, useState } from 'react'
import { CornerDownRight, GripVertical, ListEnd, Pencil, Trash2 } from 'lucide-react'
import { EFFORT_LEVELS, PERMISSION_MODES } from '@shared/format'
import type { QueueAction, QueuedMessage, SessionQueue } from '@shared/chat'
const labels = { queued: '待发', submitting: '提交中', submitted: '已提交，等待接收', received: '已接收', unknown: '提交结果未知', failed: '提交失败' }
const buttonClass = 'flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-fg3 transition-colors hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-accent'
export function MessageQueue({ queue, canInsert, onAction, onEdit, editingId }: { queue?: SessionQueue; canInsert: boolean; editingId?: string; onEdit(item: QueuedMessage): Promise<void>; onAction(action: QueueAction): Promise<void> }) {
  const dragId = useRef<string | null>(null)
  const scrollBox = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null)
  const endDrag = (): void => { dragId.current = null; setDragging(null); setDropTarget(null) }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!queue?.items.length) return null
  const act = async (action: QueueAction): Promise<void> => {
    setBusy(true); setError(null)
    try { await onAction(action) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  return <section aria-label="消息队列" className="rounded-[24px] border border-line bg-card px-3 pt-1.5 pb-5 text-[13px]" style={{ marginBottom: -20 }}>
    {(queue.paused || queue.items.length > 1) && <div className="flex items-center justify-between gap-2 px-2 py-1 text-[11px] text-fg3">
      <span>{queue.paused ? '队列已暂停' : `${queue.items.length} 条排队消息`}</span>
      <div className="flex gap-3"><button disabled={busy} onClick={() => void act({ type: queue.paused ? 'resume' : 'pause' })}>{queue.paused ? '继续队列' : '暂停'}</button><button disabled={busy} onClick={() => void act({ type: 'clear' })}>清空待发</button></div>
    </div>}
    <div ref={scrollBox} className="max-h-60 overflow-y-auto divide-y divide-line">
      {queue.items.map(item => {
        const editable = item.status === 'queued' || item.status === 'failed'
        const movable = editable && !item.editing
        const neighbors = queue.items.filter(i => !i.editing && ['queued', 'failed'].includes(i.status))
        const canDrag = movable && !busy && neighbors.length > 1
        const details = `${labels[item.status]} · ${item.options.model ?? '默认模型'} · ${EFFORT_LEVELS.find(e => e.value === item.options.effort)?.label ?? '自动思考'} · ${PERMISSION_MODES.find(m => m.value === item.options.mode)?.label ?? item.options.mode}`
        return <div key={item.id} data-queue-id={item.id}
          className={`relative py-1 ${dragging === item.id ? 'opacity-40' : ''}`}
          style={dropTarget?.id === item.id ? { boxShadow: `inset 0 ${dropTarget.position === 'before' ? '2px' : '-2px'} 0 var(--color-accent, #d97757)` } : undefined}
          onDragOver={event => {
            if (!dragId.current || !movable || busy) return
            event.preventDefault(); event.dataTransfer.dropEffect = 'move'
            const rect = event.currentTarget.getBoundingClientRect()
            setDropTarget(dragId.current === item.id ? null : { id: item.id, position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' })
            const box = scrollBox.current
            if (box) { const bounds = box.getBoundingClientRect(); if (event.clientY < bounds.top + 28) box.scrollTop -= 12; else if (event.clientY > bounds.bottom - 28) box.scrollTop += 12 }
          }}
          onDrop={event => {
            const id = dragId.current
            if (!id || !movable || busy) return
            event.preventDefault()
            const rect = event.currentTarget.getBoundingClientRect()
            const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
            endDrag()
            if (id !== item.id) void act({ type: 'move', id, targetId: item.id, position })
          }}>

          <div className="flex min-h-9 items-center gap-1.5">
            <button type="button" aria-label="拖动调整顺序" title="拖动调整顺序；也可用上下方向键移动" disabled={!canDrag} draggable={canDrag}
              className="-ml-1 flex h-8 w-4 shrink-0 cursor-grab items-center justify-center rounded text-fg3 hover:text-fg active:cursor-grabbing disabled:cursor-default disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-accent"
              onDragStart={event => {
                if (!canDrag) { event.preventDefault(); return }
                dragId.current = item.id; setDragging(item.id)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('application/x-claude-queue-message', item.id)
              }}
              onDragEnd={endDrag}
              onKeyDown={event => {
                if (!canDrag || event.nativeEvent.isComposing || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
                event.preventDefault()
                const index = neighbors.findIndex(i => i.id === item.id)
                const target = neighbors[index + (event.key === 'ArrowUp' ? -1 : 1)]
                if (target) void act({ type: 'move', id: item.id, targetId: target.id, position: event.key === 'ArrowUp' ? 'before' : 'after' })
              }}><GripVertical size={15} strokeWidth={1.8} /></button>
            <button type="button" className={`${buttonClass} px-1`} disabled={busy} aria-label={queue.paused ? '继续队列' : '暂停队列'} title={queue.paused ? '继续队列' : '暂停队列'} onClick={() => void act({ type: queue.paused ? 'resume' : 'pause' })}><ListEnd size={17} strokeWidth={1.6} /></button>
            <div className="min-w-0 flex-1 truncate pr-2 text-[14px] font-medium" title={`${item.text}\n${details}`}>{item.text}</div>
            {editable && !item.editing && <div className="flex shrink-0 items-center gap-0.5">
              <button type="button" className={buttonClass} disabled={busy || !canInsert} aria-label="立即插入" title="引导当前任务：立即插入，使用当前会话配置，不强制停止工具" onClick={() => void act({ type: 'insert', id: item.id })}><CornerDownRight size={17} strokeWidth={1.6} /><span>引导</span></button>
              <button type="button" className={buttonClass} disabled={busy} aria-label="删除" title="删除待发消息" onClick={() => void act({ type: 'delete', id: item.id })}><Trash2 size={16} strokeWidth={1.6} /></button>
              <button type="button" className={buttonClass} disabled={busy || Boolean(editingId)} aria-label="编辑" title="回到输入框编辑" onClick={async () => { setBusy(true); setError(null); try { await onEdit(item) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) } }}><Pencil size={16} strokeWidth={1.6} /></button>
            </div>}
            {(item.editing || !editable) && <span className="shrink-0 pr-2 text-[11px] text-fg3">{item.editing ? '正在输入框编辑' : labels[item.status]}</span>}
          </div>
          {item.error && <div className="px-2 pb-1 text-[12px] text-danger">{item.error}</div>}
          {item.status === 'unknown' && <div className="px-2 pb-2 text-[12px] text-fg3"><p>请先核对会话。移除记录不会重新发送或取消任务。</p><button className="mt-1 hover:text-fg" disabled={busy} onClick={() => void act({ type: 'forget', id: item.id })}>移除记录（不重发）</button></div>}
        </div>
      })}
    </div>
    {error && <div role="alert" className="px-2 py-1 text-[12px] text-danger">{error}</div>}
  </section>
}
