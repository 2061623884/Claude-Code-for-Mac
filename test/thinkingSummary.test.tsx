// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ActivitySpark } from '../src/renderer/components/ui/ActivityIndicator'
import { ThinkingSummary } from '../src/renderer/components/chat/ThinkingSummary'
import { useChat } from '../src/renderer/chatStore'
import { useDesk } from '../src/renderer/store'
import type { ChatSnapshot, UiMessage } from '../src/shared/chat'
const messages = (text: string): UiMessage[] => [{ id: 'm', role: 'assistant', parentToolUseId: null, blocks: [{ kind: 'thinking', text }] }]
let reduced = false
let motionChanged: (() => void) | undefined
beforeEach(() => {
  reduced = false
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  window.matchMedia = vi.fn().mockImplementation(() => ({ get matches() { return reduced }, addEventListener: (_name: string, listener: () => void) => { motionChanged = listener }, removeEventListener: vi.fn() }))
})
afterEach(cleanup)
it('shows a compact live summary automatically and preserves explicit expansion on completion', () => {
  const view = render(<ThinkingSummary messages={messages('一\n二\n三\n四')} state="running" activity={{ phase: 'thinking', revision: 1 }} />)
  const body = screen.getByLabelText('思考摘要内容')
  expect(body.className).toContain('max-h-[63px]')
  expect(screen.getByText('正在思考…')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '展开思考摘要' }))
  view.rerender(<ThinkingSummary messages={messages('一\n二\n三\n四')} state="idle" />)
  expect(screen.getByLabelText('思考摘要内容').className).toContain('overflow-y-auto')
  expect(screen.queryByRole('status')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '收起思考摘要' }))
  expect(screen.queryByLabelText('思考摘要内容')).toBeNull()
})
it('collapses untouched previews after completion and does not include subagent text', () => {
  const source = [...messages('主会话'), { ...messages('子 Agent')[0], id: 'child', parentToolUseId: 'tool' }]
  const view = render(<ThinkingSummary messages={source} state="running" />)
  expect(screen.getByLabelText('思考摘要内容').textContent).toBe('主会话')
  view.rerender(<ThinkingSummary messages={source} state="idle" />)
  expect(screen.queryByLabelText('思考摘要内容')).toBeNull()
})
it('leaves the reader in place while viewing earlier text in an expanded summary', () => {
  const view = render(<ThinkingSummary messages={messages('first')} state="running" />)
  fireEvent.click(screen.getByRole('button', { name: '展开思考摘要' }))
  const body = screen.getByLabelText('思考摘要内容')
  Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 1000 })
  Object.defineProperty(body, 'clientHeight', { configurable: true, value: 252 })
  body.scrollTop = 100; fireEvent.scroll(body)
  view.rerender(<ThinkingSummary messages={messages('first\nnew text')} state="running" />)
  expect(body.scrollTop).toBe(100)
  body.scrollTop = 748; fireEvent.scroll(body)
  view.rerender(<ThinkingSummary messages={messages('first\nnew text\nlatest')} state="running" />)
  expect(body.scrollTop).toBe(1000)
})
it('shows actual tool and approval states without inventing a thinking summary', () => {
  const view = render(<ThinkingSummary messages={messages('')} state="running" activity={{ phase: 'tool', toolName: 'Read', revision: 1 }} />)
  expect(screen.getByText('正在读取文件…')).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
  view.rerender(<ThinkingSummary messages={messages('')} state="awaiting" />)
  expect(screen.getByText('等待你确认')).toBeTruthy()
  expect(view.container.querySelector('animate')).toBeNull()
  view.rerender(<ThinkingSummary messages={[]} state="error" />)
  expect(view.container.textContent).toBe('')
})
it('stops Spark on reduced motion, hidden documents and inactive side pages', () => {
  const view = render(<ActivitySpark />)
  expect(view.container.querySelector('animate')).toBeTruthy()
  act(() => { reduced = true; motionChanged?.() })
  expect(view.container.querySelector('animate')).toBeNull()
  act(() => { reduced = false; motionChanged?.(); Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  expect(view.container.querySelector('animate')).toBeNull()
  act(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')) })
  expect(view.container.querySelector('animate')).toBeTruthy()
  view.rerender(<ActivitySpark active={false} />)
  expect(view.container.querySelector('animate')).toBeNull()
})
it('keeps session activity isolated and rejects an older activity snapshot', async () => {
  useChat.setState({ chats: {} })
  useDesk.setState({ projects: [{ id: 'p', name: 'P', path: '/p', addedAt: 0, collapsed: false }] })
  let resolve!: (snapshot: ChatSnapshot) => void
  window.desk = { chat: { open: () => new Promise((done) => { resolve = done }) } } as unknown as Window['desk']
  const loading = useChat.getState().load('a', 'p')
  useChat.getState().handle('a', { kind: 'activity', activity: { phase: 'idle', revision: 5 } })
  useChat.getState().handle('a', { kind: 'state', state: 'idle' })
  useChat.getState().handle('b', { kind: 'activity', activity: { phase: 'tool', toolName: 'Bash', revision: 6 } })
  resolve({ activity: { phase: 'thinking', revision: 4 }, messages: [], state: 'running', approvals: [], live: true })
  await loading
  expect(useChat.getState().chats.a.activity?.phase).toBe('idle')
  expect(useChat.getState().chats.a.state).toBe('idle')
  expect(useChat.getState().chats.b.activity?.phase).toBe('tool')
  useChat.getState().handle('a', { kind: 'activity', activity: { phase: 'thinking', revision: 3 } })
  expect(useChat.getState().chats.a.activity?.phase).toBe('idle')
})

it('does not follow when the reader scrolls just one line above the bottom', () => {
  const view = render(<ThinkingSummary messages={messages('first')} state="running" />)
  fireEvent.click(screen.getByRole('button', { name: '展开思考摘要' }))
  const body = screen.getByLabelText('思考摘要内容')
  Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 273 })
  Object.defineProperty(body, 'clientHeight', { configurable: true, value: 252 })
  body.scrollTop = 0; fireEvent.scroll(body)
  view.rerender(<ThinkingSummary messages={messages('first\nnew')} state="running" />)
  expect(body.scrollTop).toBe(0)
})

it('does not lose streamed thinking received while an older snapshot is loading', async () => {
  useChat.setState({ chats: {} })
  useDesk.setState({ projects: [{ id: 'p', name: 'P', path: '/p', addedAt: 0, collapsed: false }] })
  let resolve!: (snapshot: ChatSnapshot) => void
  window.desk = { chat: { open: () => new Promise((done) => { resolve = done }) } } as unknown as Window['desk']
  const loading = useChat.getState().load('race', 'p')
  useChat.getState().handle('race', { kind: 'upsert', messages: messages('已经收到的完整摘要') })
  resolve({ messages: messages('旧摘要'), state: 'running', approvals: [], live: true })
  await loading
  expect(useChat.getState().chats.race.messages[0].blocks).toEqual([{ kind: 'thinking', text: '已经收到的完整摘要' }])
})
