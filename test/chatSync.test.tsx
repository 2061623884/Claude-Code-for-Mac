// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import type { ApprovalRequest, ChatSnapshot, SessionQueue, UiMessage } from '../src/shared/chat'
import { useChat } from '../src/renderer/chatStore'
import { useDesk } from '../src/renderer/store'

const marks = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock('../src/renderer/sessionMarks', () => ({ useSessionMarks: { getState: () => marks } }))

const options = { model: null, mode: 'default' as const, effort: null }
const message = (id: string, text: string): UiMessage => ({ id, role: 'assistant', parentToolUseId: null, blocks: [{ kind: 'text', text }] })
const queue: SessionQueue = { items: [{ id: 'q', text: 'next', options, status: 'queued' }], paused: true }
const snapshot = (patch: Partial<ChatSnapshot> = {}): ChatSnapshot => ({ revision: 10, messages: [], approvals: [], state: 'idle', live: false, options, optionsSaved: true, queue: { items: [], paused: false }, ...patch })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
beforeEach(() => {
  marks.complete.mockClear()
  useDesk.setState({ projects: [{ id: 'p', path: '/tmp', name: 'p', addedAt: 0, collapsed: false }], sessions: {}, view: { kind: 'new' } })
  useChat.setState({ chats: {} })
  window.desk = {
    chat: { open: vi.fn(), reload: vi.fn(), fork: vi.fn().mockResolvedValue('fork'), setMode: vi.fn() },
    sessions: { list: vi.fn().mockResolvedValue([]) }
  } as unknown as Window['desk']
})

it.each(['load', 'reload'] as const)('%s keeps newer queue, settings, state and body events over a delayed snapshot', async kind => {
  const pending = deferred<ChatSnapshot>()
  if (kind === 'reload') useChat.setState({ chats: { s: { ...snapshot(), options, projectId: 'p', loaded: true, error: null } } })
  vi.mocked(window.desk.chat[kind === 'load' ? 'open' : 'reload']).mockReturnValue(pending.promise)
  const loading = kind === 'load' ? useChat.getState().load('s', 'p') : useChat.getState().reload('s')
  useChat.getState().handle('s', { kind: 'queue', queue, revision: 11 })
  useChat.getState().handle('s', { kind: 'options', options: { ...options, mode: 'plan' }, optionsSaved: false, optionsSaveError: '保存失败', revision: 12 })
  useChat.getState().handle('s', { kind: 'upsert', messages: [message('reply', 'new text')], revision: 13 })
  useChat.getState().handle('s', { kind: 'state', state: 'running', revision: 14 })
  useChat.getState().handle('s', { kind: 'notice', text: 'new error', revision: 15 })
  pending.resolve(snapshot({ messages: [message('reply', 'old text')] }))
  await loading
  expect(useChat.getState().chats.s).toMatchObject({ queue, options: { mode: 'plan' }, optionsSaved: false, optionsSaveError: '保存失败', messages: [message('reply', 'new text')], state: 'running', error: 'new error' })
})

it('accepts a newer server snapshot even when an older event arrives after the request', async () => {
  const pending = deferred<ChatSnapshot>()
  vi.mocked(window.desk.chat.open).mockReturnValue(pending.promise)
  const loading = useChat.getState().load('s', 'p')
  useChat.getState().handle('s', { kind: 'queue', queue, revision: 11 })
  pending.resolve(snapshot({ revision: 20 }))
  await loading
  expect(useChat.getState().chats.s.queue!.items).toEqual([])
  useChat.getState().handle('s', { kind: 'queue', queue, revision: 19 })
  expect(useChat.getState().chats.s.queue!.items).toEqual([])
})

it('replays approval deltas over snapshot approvals rather than replacing the whole list', async () => {
  const approval = (requestId: string): ApprovalRequest => ({ requestId, toolName: 'Read', input: {}, canAlwaysAllow: false })
  const pending = deferred<ChatSnapshot>()
  vi.mocked(window.desk.chat.open).mockReturnValue(pending.promise)
  const loading = useChat.getState().load('s', 'p')
  useChat.getState().handle('s', { kind: 'approvalDone', requestId: 'a', revision: 11 })
  useChat.getState().handle('s', { kind: 'approval', request: approval('c'), revision: 12 })
  pending.resolve(snapshot({ approvals: [approval('a'), approval('b')] }))
  await loading
  expect(useChat.getState().chats.s.approvals.map(a => a.requestId)).toEqual(['b', 'c'])
})

it('does not let an earlier open replace a later reload', async () => {
  const pending = deferred<ChatSnapshot>()
  vi.mocked(window.desk.chat.open).mockReturnValue(pending.promise)
  vi.mocked(window.desk.chat.reload).mockResolvedValue(snapshot({ revision: 20, messages: [message('fresh', 'fresh')] }))
  const loading = useChat.getState().load('s', 'p')
  await useChat.getState().reload('s')
  pending.resolve(snapshot())
  await loading
  expect(useChat.getState().chats.s.messages).toEqual([message('fresh', 'fresh')])
})

it('uses the same snapshot merge for a fork created by editing history', async () => {
  useChat.setState({ chats: { s: { ...snapshot({ messages: [{ ...message('user', 'old'), role: 'user', forkFrom: 'point' }] }), options, projectId: 'p', loaded: true, error: null } } })
  const pending = deferred<ChatSnapshot>()
  vi.mocked(window.desk.chat.open).mockReturnValue(pending.promise)
  const editing = useChat.getState().edit('s', 'user', 'edited')
  await vi.waitFor(() => expect(window.desk.chat.open).toHaveBeenCalledWith('fork', '/tmp'))
  useChat.getState().handle('fork', { kind: 'queue', queue, revision: 11 })
  useChat.getState().handle('fork', { kind: 'upsert', messages: [message('reply', 'streaming reply')], revision: 12 })
  pending.resolve(snapshot())
  await editing
  expect(useChat.getState().chats.fork).toMatchObject({ queue, messages: [message('reply', 'streaming reply')], projectId: 'p', loaded: true })
})

it('retains confirmed options when the command rejects only because persistence failed', async () => {
  useChat.setState({ chats: { s: { ...snapshot(), options, projectId: 'p', loaded: true, error: null } } })
  vi.mocked(window.desk.chat.setMode).mockImplementation(async () => {
    useChat.getState().handle('s', { kind: 'options', options: { ...options, mode: 'acceptEdits' }, optionsSaved: false, optionsSaveError: '保存失败', revision: 11 })
    throw new Error('已生效，但保存失败')
  })
  await expect(useChat.getState().setOptions('s', { mode: 'acceptEdits' })).rejects.toThrow('保存失败')
  expect(useChat.getState().chats.s).toMatchObject({ options: { mode: 'acceptEdits' }, optionsSaved: false, optionsSaveError: '保存失败' })
})

it('supports unversioned snapshot fixtures without dropping events received while loading', async () => {
  const pending = deferred<ChatSnapshot>()
  vi.mocked(window.desk.chat.open).mockReturnValue(pending.promise)
  const loading = useChat.getState().load('s', 'p')
  useChat.getState().handle('s', { kind: 'queue', queue })
  useChat.getState().handle('s', { kind: 'options', options: { ...options, mode: 'plan' } })
  pending.resolve(snapshot({ revision: undefined }))
  await loading
  expect(useChat.getState().chats.s).toMatchObject({ queue, options: { mode: 'plan' } })
})

it('delivers a result error even if a newer snapshot arrived first', async () => {
  vi.mocked(window.desk.chat.open).mockResolvedValue(snapshot({ revision: 20 }))
  await useChat.getState().load('s', 'p')
  useChat.getState().handle('s', { kind: 'result', resultId: 'failed-turn', durationMs: 1, error: 'SDK failed', revision: 19 })
  expect(useChat.getState().chats.s).toMatchObject({ error: 'SDK failed', lastResult: { resultId: 'failed-turn' } })
  expect(marks.complete).toHaveBeenCalledOnce()
})
