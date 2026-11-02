// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { InternalNotice, TechnicalRecords } from '../src/renderer/components/chat/InternalNotice'
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
