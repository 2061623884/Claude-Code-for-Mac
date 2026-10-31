// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useChat, useChatActions } from '../src/renderer/chatStore'
import { useDesk } from '../src/renderer/store'
import { useLayout } from '../src/renderer/layoutStore'
const project = (id: string) => ({ id, path: '/tmp/review-project', name: 'review', addedAt: 0, collapsed: false })
const options = { model: 'opus', mode: 'default' as const, effort: 'medium' as const }
const chat = (projectId: string) => ({ projectId, loaded: true, messages: [], approvals: [], state: 'idle' as const, options, error: null })
beforeEach(() => {
  useLayout.setState({ activeSessionId: null, projectId: undefined, sessions: {}, pages: [] })
  useDesk.setState({ projects: [project('old')], sessions: {}, view: { kind: 'new' }, selectedProjectId: 'old' })
  useChat.setState({ chats: { s: chat('old') } })
  window.desk = {
    workspace: { closePage: vi.fn().mockResolvedValue(undefined) },
    projects: { remove: vi.fn().mockResolvedValue([]), add: vi.fn().mockResolvedValue([project('new')]) },
    sessions: { list: vi.fn().mockResolvedValue([]) },
    chat: { send: vi.fn().mockResolvedValue(undefined), open: vi.fn(), setMode: vi.fn().mockResolvedValue(undefined), setModel: vi.fn().mockResolvedValue(undefined), setEffort: vi.fn().mockResolvedValue(undefined), respond: vi.fn().mockResolvedValue(undefined) }
  } as unknown as Window['desk']
})
afterEach(cleanup)
it('keeps the confirmed mode and exposes an error when SDK rejects a change', async () => {
  vi.mocked(window.desk.chat.setMode).mockRejectedValue(new Error('SDK rejected mode'))
  await expect(useChat.getState().setOptions('s', { mode: 'plan' })).rejects.toThrow('SDK rejected mode')
  expect(useChat.getState().chats.s.options.mode).toBe('default')
  expect(useChat.getState().chats.s.error).toContain('SDK rejected mode')
})
it('serializes changes, recovers after failure and sends with confirmed options', async () => {
  let reject!: (reason: Error) => void
  vi.mocked(window.desk.chat.setMode).mockImplementationOnce(() => new Promise((_, no) => { reject = no }))
  const first = useChat.getState().setOptions('s', { mode: 'plan' })
  const checked = expect(first).rejects.toThrow('rejected')
  const second = useChat.getState().setOptions('s', { mode: 'acceptEdits' })
  const send = useChat.getState().send('s', 'continue')
  await vi.waitFor(() => expect(window.desk.chat.setMode).toHaveBeenCalledTimes(1))
  expect(useChat.getState().chats.s.options.mode).toBe('default')
  expect(window.desk.chat.send).not.toHaveBeenCalled()
  reject(new Error('rejected'))
  await checked; await second; await send
  expect(useChat.getState().chats.s.options.mode).toBe('acceptEdits')
  expect(window.desk.chat.send).toHaveBeenCalledWith('s', '/tmp/review-project', 'continue', expect.objectContaining({ mode: 'acceptEdits' }))
})
it('preserves only successfully applied fields when a multi-field change fails', async () => {
  vi.mocked(window.desk.chat.setModel).mockRejectedValue(new Error('unsupported'))
  await expect(useChat.getState().setOptions('s', { mode: 'plan', model: 'bad', effort: 'high' })).rejects.toThrow('unsupported')
  expect(useChat.getState().chats.s.options).toEqual({ ...options, mode: 'plan' })
  expect(window.desk.chat.setEffort).not.toHaveBeenCalled()
})
it('uses acknowledged settings for slash commands and supports null defaults', async () => {
  await useChat.getState().send('s', '/model default')
  await useChat.getState().send('s', '/effort high')
  expect(useChat.getState().chats.s.options).toEqual({ ...options, model: null, effort: 'high' })
  expect(window.desk.chat.send).not.toHaveBeenCalled()
})
it('does not show a plan approval as effective after rejection', async () => {
  vi.mocked(window.desk.chat.respond).mockRejectedValue(new Error('mode rejected'))
  await expect(useChat.getState().respond('s', 'request', { type: 'planApprove', mode: 'plan' })).rejects.toThrow('mode rejected')
  expect(useChat.getState().chats.s.options.mode).toBe('default')
})
it('rebinds cached sessions after removing and readding their directory, releasing pages once', async () => {
  useDesk.getState().setView({ kind: 'session', sessionId: 's', projectId: 'old' })
  const page = useLayout.getState().newPage('/tmp/review-project', 'terminal')
  await useDesk.getState().removeProject('old')
  expect(useChat.getState().chats.s.projectId).toBe('')
  expect(window.desk.workspace.closePage).toHaveBeenCalledExactlyOnceWith(page)
  useDesk.setState({ pendingProjectPath: '/tmp/review-project' })
  await useDesk.getState().confirmAddProject()
  await useChat.getState().load('s', 'new')
  await expect(useChat.getState().send('s', 'continue')).resolves.toBeUndefined()
  expect(useChat.getState().chats.s.projectId).toBe('new')
  expect(window.desk.chat.open).not.toHaveBeenCalled()
})
it('does not detach chats or release pages if project removal fails', async () => {
  vi.mocked(window.desk.projects.remove).mockRejectedValue(new Error('disk full'))
  await expect(useDesk.getState().removeProject('old')).rejects.toThrow('disk full')
  expect(useChat.getState().chats.s.projectId).toBe('old')
  expect(window.desk.workspace.closePage).not.toHaveBeenCalled()
})
it('does not rerender a foreground chat for another session update', () => {
  let renders = 0
  function Foreground() {
    const current = useChat(s => s.chats.s)
    const { send } = useChatActions()
    renders++
    return <button onClick={() => void send('s', 'hello')}>{current.state}</button>
  }
  render(<Foreground />)
  const initial = renders
  act(() => useChat.getState().handle('other', { kind: 'upsert', messages: [{ id: 'm', role: 'assistant', parentToolUseId: null, blocks: [{ kind: 'text', text: 'delta' }] }] }))
  expect(renders).toBe(initial)
  act(() => useChat.getState().handle('s', { kind: 'state', state: 'running' }))
  expect(renders).toBe(initial + 1)
})
