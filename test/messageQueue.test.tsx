// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MessageQueue } from '../src/renderer/components/chat/MessageQueue'
afterEach(cleanup)
it('edits, inserts and deletes the selected message; unavailable execution disables insertion', async () => {
  const onAction = vi.fn().mockResolvedValue(undefined)
  const onEdit = vi.fn().mockResolvedValue(undefined)
  const queue = { paused: false, items: [{ id: 'q', text: '待发任务', status: 'queued' as const, options: { model: 'sonnet', effort: 'low' as const, mode: 'default' as const } }] }
  const view = render(<MessageQueue queue={queue} canInsert onAction={onAction} onEdit={onEdit} />)
  fireEvent.click(screen.getByRole('button', { name: '编辑' }))
  await waitFor(() => expect(onEdit).toHaveBeenCalledWith(queue.items[0]))
  expect(screen.queryByRole('textbox')).toBeNull()
  await waitFor(() => expect(screen.getByRole('button', { name: '立即插入' })).toHaveProperty('disabled', false))
  fireEvent.click(screen.getByRole('button', { name: '立即插入' }))
  await waitFor(() => expect(onAction).toHaveBeenCalledWith({ type: 'insert', id: 'q' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '删除' })).toHaveProperty('disabled', false))
  fireEvent.click(screen.getByRole('button', { name: '删除' }))
  await waitFor(() => expect(onAction).toHaveBeenCalledWith({ type: 'delete', id: 'q' }))
  view.rerender(<MessageQueue queue={queue} canInsert={false} onAction={onAction} onEdit={onEdit} />)
  expect(screen.getByRole('button', { name: '立即插入' })).toHaveProperty('disabled', true)
})

it('uses the six-dot handle to move a message relative to the drop target', async () => {
  const onAction = vi.fn().mockResolvedValue(undefined)
  const options = { model: 'sonnet', effort: 'low' as const, mode: 'default' as const }
  const queue = { paused: false, items: ['first', 'second'].map(id => ({ id, text: id, status: 'queued' as const, options })) }
  const { container } = render(<MessageQueue queue={queue} canInsert onAction={onAction} onEdit={vi.fn()} />)
  const handles = screen.getAllByRole('button', { name: '拖动调整顺序' })
  expect(handles[0].querySelectorAll('circle')).toHaveLength(6)
  const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
  fireEvent.dragStart(handles[0], { dataTransfer })
  const target = container.querySelector('[data-queue-id="second"]')!
  fireEvent.dragOver(target, { dataTransfer, clientY: 10 })
  fireEvent.drop(target, { dataTransfer, clientY: 10 })
  await waitFor(() => expect(onAction).toHaveBeenCalledWith({ type: 'move', id: 'first', targetId: 'second', position: 'after' }))
  expect(dataTransfer.setData).toHaveBeenCalledWith('application/x-claude-queue-message', 'first')
})
