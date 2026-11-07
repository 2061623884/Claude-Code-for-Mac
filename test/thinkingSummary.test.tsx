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
it('shows a four-line live window, expands to the full text and folds back to the window', () => {
  const view = render(<ThinkingSummary text={'一\n二\n三\n四\n五'} streaming />)
  const body = screen.getByLabelText('思考摘要内容')
  expect(body.style.maxHeight).toBe('84px')
  expect(body.className).toContain('overflow-y-auto')
  fireEvent.click(screen.getByRole('button', { name: '展开思考摘要' }))
  view.rerender(<ThinkingSummary text={'一\n二\n三\n四\n五'} />)
  const full = screen.getByLabelText('思考摘要内容')
  expect(full.style.maxHeight).toBe('')
  expect(full.className).not.toContain('overflow-y-auto')
  fireEvent.click(screen.getByRole('button', { name: '收起思考摘要' }))
  expect(screen.getByLabelText('思考摘要内容').style.maxHeight).toBe('84px')
})
it('keeps a preview in place when its block finishes streaming', () => {
  const view = render(<ThinkingSummary text="主会话" streaming />)
  expect(screen.getByLabelText('思考摘要内容').textContent).toBe('主会话')
  const header = screen.getByRole('button', { name: '展开思考摘要' })
  view.rerender(<ThinkingSummary text="主会话" />)
  expect(screen.getByLabelText('思考摘要内容').textContent).toBe('主会话')
  expect(screen.getByRole('button', { name: '展开思考摘要' })).toBe(header)
})

it('leaves the reader in place while reviewing earlier text in the live window', () => {
  const view = render(<ThinkingSummary text={'first'} streaming />)
  const body = screen.getByLabelText('思考摘要内容')
  Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 1000 })
  Object.defineProperty(body, 'clientHeight', { configurable: true, value: 252 })
  body.scrollTop = 100; fireEvent.scroll(body)
  view.rerender(<ThinkingSummary text={'first\nnew text'} streaming />)
  expect(body.scrollTop).toBe(100)
  body.scrollTop = 748; fireEvent.scroll(body)
  view.rerender(<ThinkingSummary text={'first\nnew text\nlatest'} streaming />)
  expect(body.scrollTop).toBe(1000)
})
it('omits empty summaries and keeps summaries from history folded', () => {
  const view = render(<ThinkingSummary text="  " streaming />)
  expect(view.container.textContent).toBe('')
  view.rerender(<ThinkingSummary text="已保存的摘要" />)
  expect(screen.getByRole('button', { name: '展开思考摘要' })).toBeTruthy()
  expect(screen.queryByLabelText('思考摘要内容')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '展开思考摘要' }))
  expect(screen.getByLabelText('思考摘要内容').style.maxHeight).toBe('')
  fireEvent.click(screen.getByRole('button', { name: '收起思考摘要' }))
  expect(screen.queryByLabelText('思考摘要内容')).toBeNull()
})

it('shows a drag rail only when the live window overflows and scrolls proportionally when dragged', () => {
  const view = render(<ThinkingSummary text={'短'} streaming />)
  expect(view.container.querySelector('[data-thinking-rail]')).toBeNull()
  const body = screen.getByLabelText('思考摘要内容')
  Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 336 })
  Object.defineProperty(body, 'clientHeight', { configurable: true, value: 84 })
  body.scrollTop = 252; fireEvent.scroll(body)
  const rail = view.container.querySelector('[data-thinking-rail]') as HTMLElement
  const thumb = rail.lastElementChild as HTMLElement
  expect(thumb.style.height).toBe('21px')
  expect(thumb.style.top).toBe('63px')
  expect(body.style.maskImage).toContain('linear-gradient')
  fireEvent.pointerDown(rail, { button: 0, clientY: 70, pointerId: 1 })
  fireEvent.pointerMove(rail, { clientY: 49, pointerId: 1 })
  expect(body.scrollTop).toBe(168)
  fireEvent.scroll(body) // 浏览器修改 scrollTop 会派发 scroll，jsdom 需手动补发
  expect(thumb.style.top).toBe('42px')
  fireEvent.pointerUp(rail, { pointerId: 1 })
  fireEvent.pointerMove(rail, { clientY: 0, pointerId: 1 })
  expect(body.scrollTop).toBe(168)
  view.rerender(<ThinkingSummary text={'短\n更多'} streaming />)
  expect(body.scrollTop).toBe(168)
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
it('isolates SVG masks between indicators and retains the expanded reference when paused', () => {
  const view = render(<><ActivitySpark /><ActivitySpark active={false} /></>)
  const indicators = [...view.container.querySelectorAll('[data-activity-spark]')]
  const masks = indicators.map(svg => svg.querySelector('mask')!.id)
  expect(new Set(masks).size).toBe(2)
  indicators.forEach((svg, index) => {
    expect(svg.querySelector('rect')!.getAttribute('mask')).toBe(`url(#${masks[index]})`)
    expect(svg.querySelectorAll('image')).toHaveLength(9)
  })
  expect(indicators[1].querySelectorAll('image[opacity="1"]')).toHaveLength(1)
  expect(indicators[1].querySelector('image[opacity="1"]')!.getAttribute('href')).toContain('frame-05.png')
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
  const view = render(<ThinkingSummary text={'first'} streaming />)
  const body = screen.getByLabelText('思考摘要内容')
  Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 105 })
  Object.defineProperty(body, 'clientHeight', { configurable: true, value: 84 })
  body.scrollTop = 0; fireEvent.scroll(body)
  view.rerender(<ThinkingSummary text={'first\nnew'} streaming />)
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
