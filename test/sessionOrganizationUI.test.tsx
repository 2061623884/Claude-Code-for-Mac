// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Sidebar } from '../src/renderer/components/sidebar/Sidebar'
import { useOrganization } from '../src/renderer/organizationStore'
import { useDesk } from '../src/renderer/store'
import { useChat } from '../src/renderer/chatStore'
import { useLayout } from '../src/renderer/layoutStore'
import { useSessionAttention } from '../src/renderer/hooks/useSessionAttention'
import { notifyIfAway, useNotice } from '../src/renderer/notify'
import {
  emptyOrganization,
  recordCompletion,
  updateOrganization,
  type OrganizationAction
} from '../src/shared/sessionOrganization'
const project = { id: 'p', path: '/project', name: 'Project', addedAt: 0, collapsed: false }
const session = { id: 'a', title: '会话 A', cwd: '/project', lastModified: 0, archived: false }
const blank = {
  projectId: 'p',
  messages: [],
  state: 'idle' as const,
  approvals: [],
  loaded: true,
  options: { model: null, mode: 'default' as const, effort: null },
  error: null
}
const changes = vi.fn()
beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  useDesk.setState({ projects: [project], sessions: { p: [session] }, view: { kind: 'new' }, demo: null })
  useChat.setState({ chats: { a: { ...blank }, b: { ...blank } } })
  useLayout.setState({ rightOpen: false, expanded: false })
  useOrganization.setState({ value: emptyOrganization(), error: null })
  useNotice.setState({ notice: null })
  changes.mockImplementation(async (action: OrganizationAction) =>
    updateOrganization(useOrganization.getState().value, action)
  )
  window.desk = {
    organization: { get: async () => useOrganization.getState().value, change: changes, onChanged: () => () => {} }
  } as unknown as Window['desk']
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  changes.mockClear()
})
it('renders a pinned session once and returns it to its original section on unpin', async () => {
  let value = updateOrganization(emptyOrganization(), { kind: 'create', id: 's', title: '客户' })
  value = updateOrganization(value, { kind: 'move', sessionId: 'a', sectionId: 's' })
  value = updateOrganization(value, { kind: 'pin', sessionId: 'a', pinned: true })
  useOrganization.setState({ value })
  const view = render(<Sidebar width={300} />)
  expect(view.container.querySelectorAll('[data-session-row="a"]')).toHaveLength(1)
  expect(screen.getByRole('region', { name: '置顶' }).querySelector('[data-session-row="a"]')).toBeTruthy()
  expect(screen.getByRole('region', { name: '分区 客户' }).querySelector('[data-session-row="a"]')).toBeNull()
  await act(() => useOrganization.getState().change({ kind: 'pin', sessionId: 'a', pinned: false }))
  expect(screen.getByRole('region', { name: '分区 客户' }).querySelector('[data-session-row="a"]')).toBeTruthy()
})
it('does not clear attention until the foreground conversation is loaded and visible; approvals remain separate', async () => {
  useOrganization.setState({ value: recordCompletion(emptyOrganization(), 'a', 'completed') })
  useChat.setState({
    chats: {
      a: {
        ...blank,
        loaded: false,
        state: 'awaiting',
        approvals: [{ requestId: 'r', toolName: 'Bash', input: {}, canAlwaysAllow: false }]
      }
    }
  })
  useDesk.setState({ view: { kind: 'session', sessionId: 'a', projectId: 'p' } })
  function Harness() {
    useSessionAttention()
    return <Sidebar width={300} />
  }
  render(<Harness />)
  await new Promise((r) => setTimeout(r, 40))
  expect(changes).not.toHaveBeenCalled()
  act(() => {
    useLayout.setState({ rightOpen: true, expanded: true })
    useChat.setState({ chats: { a: { ...useChat.getState().chats.a, loaded: true } } })
  })
  await new Promise((r) => setTimeout(r, 40))
  expect(changes).not.toHaveBeenCalled()
  act(() => useLayout.setState({ expanded: false }))
  await waitFor(() => expect(screen.queryByLabelText('完成后未读')).toBeNull())
  expect(screen.getByLabelText('待确认')).toBeTruthy()
  act(() => useChat.getState().handle('a', { kind: 'approvalDone', requestId: 'r' }))
  expect(screen.queryByLabelText('待确认')).toBeNull()
})
it('uses a non-focusing foreground notice for another session and deduplicates events', () => {
  useDesk.setState({ view: { kind: 'session', sessionId: 'a', projectId: 'p' } })
  const event = { kind: 'result' as const, eventId: 'notice-result', completed: true, durationMs: 1, error: null }
  notifyIfAway('b', event)
  expect(useNotice.getState().notice?.sessionId).toBe('b')
  useNotice.setState({ notice: null })
  notifyIfAway('b', event)
  expect(useNotice.getState().notice).toBeNull()
  notifyIfAway('a', { ...event, eventId: 'current-result' })
  expect(useNotice.getState().notice).toBeNull()
})
