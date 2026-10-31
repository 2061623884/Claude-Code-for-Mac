// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useSessionMarks } from '../src/renderer/sessionMarks'
import { Sidebar } from '../src/renderer/components/sidebar/Sidebar'
import { useDesk } from '../src/renderer/store'
import { useChat } from '../src/renderer/chatStore'

vi.hoisted(() => {
  const data = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) }
  } })
})

beforeEach(() => {
  useSessionMarks.setState({ pinned: [], unread: {} })
  useChat.setState({ chats: {} })
  useDesk.setState({ view: { kind: 'new' }, demo: null, projects: [{ id: 'p', name: '原项目', path: '/p', addedAt: 0, collapsed: false }], sessions: { p: ['a', 'b'].map(id => ({ id, title: `会话${id}`, cwd: '/p', lastModified: 1, archived: false })) } })
})
afterEach(cleanup)
it('moves the row to the top without duplicating it or adding project text; one click restores its original position', () => {
  render(<Sidebar width={260} />)
  fireEvent.click(screen.getAllByLabelText('置顶')[1])
  expect(screen.getAllByText('会话b')).toHaveLength(1)
  expect(screen.getByText('会话b').closest('[role="button"]')?.textContent).not.toContain('原项目')
  expect(screen.getAllByRole('button').filter(e => e.title.startsWith('会话')).map(e => e.title)).toEqual(['会话b', '会话a'])
  fireEvent.click(screen.getByLabelText('取消置顶'))
  expect(screen.getAllByRole('button').filter(e => e.title.startsWith('会话')).map(e => e.title)).toEqual(['会话a', '会话b'])
  expect(useDesk.getState().view.kind).toBe('new')
})
it('hides archived pins and restores them when unarchived; persists pins and unread marks', async () => {
  useSessionMarks.getState().togglePin('b')
  useSessionMarks.getState().complete('b')
  const saved = window.localStorage.getItem('claude-desk-session-marks')!
  useSessionMarks.setState({ pinned: [], unread: {} })
  window.localStorage.setItem('claude-desk-session-marks', saved)
  await useSessionMarks.persist.rehydrate()
  expect(useSessionMarks.getState()).toMatchObject({ pinned: ['b'], unread: { b: true } })
  const original = useDesk.getState().sessions
  useDesk.setState({ sessions: { p: original.p.map(s => ({ ...s, archived: s.id === 'b' })) } })
  render(<Sidebar width={260} />)
  expect(screen.queryByLabelText('取消置顶')).toBeNull()
  act(() => useDesk.setState({ sessions: original }))
  expect(screen.getByLabelText('取消置顶')).toBeTruthy()
})
it('deduplicates completion events after reading and keeps permission state separate', () => {
  const event = { kind: 'result' as const, resultId: 'result-1', durationMs: 100, error: null }
  useChat.getState().handle('task', { kind: 'approval', request: { requestId: 'req', toolName: 'Bash', input: {}, canAlwaysAllow: false } })
  useChat.getState().handle('task', event)
  expect(useSessionMarks.getState().unread.task).toBe(true)
  useSessionMarks.getState().markRead('task')
  useChat.getState().handle('task', event)
  expect(useSessionMarks.getState().unread.task).toBeUndefined()
  expect(useChat.getState().chats.task.approvals).toHaveLength(1)
  useChat.getState().handle('task', { ...event, resultId: 'result-2' })
  expect(useSessionMarks.getState().unread.task).toBe(true)
  useSessionMarks.getState().markRead('task')
  useChat.getState().handle('task', event)
  expect(useSessionMarks.getState().unread.task).toBeUndefined()
})
it('keeps the unread dot and approval label visible beside row actions', () => {
  useSessionMarks.getState().complete('a')
  useChat.getState().handle('a', { kind: 'state', state: 'awaiting' })
  render(<Sidebar width={260} />)
  expect(screen.getByLabelText('有未读回复').className).not.toContain('hidden')
  expect(screen.getByText('待确认').className).not.toContain('hidden')
})
