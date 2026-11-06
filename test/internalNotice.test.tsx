// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { InternalNotice, TaskNotice, TechnicalRecords } from '../src/renderer/components/chat/InternalNotice'
import type { UiMessage } from '../src/shared/chat'
afterEach(cleanup)
const msg = (id: string, internalKind: UiMessage['internalKind'], text: string): UiMessage => ({ id, role: 'notice', source: 'internal', internalKind, blocks: [{ kind: 'text', text }], parentToolUseId: null })
it('shows one collapsed entry for three records and retains all content for inspection', () => {
  const records = ['one','two','three'].map(id => msg(id, 'technical', id))
  const view = render(<TechnicalRecords messages={records} />)
  expect(view.getAllByText('技术记录 · 3 条')).toHaveLength(1)
  const detail = view.container.querySelector('details')!
  expect(detail.open).toBe(false)
  fireEvent.click(view.getByText('技术记录 · 3 条'))
  expect(detail.open).toBe(true)
  for (const id of ['one','two','three']) expect(view.getByText(id)).toBeTruthy()
  expect(view.queryByText('内部记录')).toBeNull()
})
it('shows a compact summary label and keeps summary content available', () => {
  const view = render(<InternalNotice message={msg('summary','compact','saved context')} />)
  expect(view.getByText('已整理上下文')).toBeTruthy()
  expect(view.container.querySelector('details')?.open).toBe(false)
  expect(view.getByText('saved context')).toBeTruthy()
})
it.each(['notification', 'technical', undefined] as const)('never collapses recognizable errors for %s', kind => {
  const view = render(<InternalNotice message={msg('err',kind,'API Error: 500')} />)
  expect(view.container.querySelector('details')).toBeNull()
  expect(view.getByText('API Error: 500')).toBeTruthy()
})
it('does not duplicate a command record', () => {
  const view = render(<InternalNotice message={msg('cmd','command','<command-name>/model</command-name>')} />)
  expect(view.container.textContent).toBe('')
})
const taskMsg = (text: string): UiMessage => ({ id: 'task', role: 'notice', source: 'external', originKind: 'task-notification', blocks: [{ kind: 'text', text }], parentToolUseId: null })
it('collapses a task notification into status and summary while keeping the raw record', () => {
  const raw = '<task-notification>\n<task-id>bw7</task-id>\n<status>completed</status>\n<summary>Background command "Run app" completed (exit code 0)</summary>\n</task-notification>'
  const view = render(<TaskNotice message={taskMsg(raw)} />)
  expect(view.getByText('后台任务 · 已完成 · Background command "Run app" completed (exit code 0)')).toBeTruthy()
  expect(view.container.querySelector('details')!.open).toBe(false)
  expect(view.container.textContent).toContain('<task-id>bw7</task-id>')
})
it('shows unparseable task notifications verbatim', () => {
  const view = render(<TaskNotice message={taskMsg('done')} />)
  expect(view.getByText('done')).toBeTruthy()
  expect(view.container.querySelector('details')).toBeNull()
})
