// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cancelFirstSend, captureFirstSend, isFirstSendTarget, syncFirstSend } from '../src/renderer/motion/firstSend'
import { useChat } from '../src/renderer/chatStore'
import { useDesk } from '../src/renderer/store'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 200, width: 300, height: 100, top: 200, left: 100, bottom: 300, right: 400, toJSON() {} })
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: vi.fn(() => ({ cancel: vi.fn(), onfinish: null })) })
  document.body.innerHTML = '<div id="source"><div data-composer-surface><div contenteditable="true">draft</div></div><svg class="crab"></svg></div>'
})
afterEach(() => { cancelFirstSend(); document.body.innerHTML = ''; delete document.documentElement.dataset.reduceMotion; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const capture = () => captureFirstSend(document.querySelector('#source'))!

it('captures without hiding the draft, and releases snapshots after a failed send', () => {
  const flight = capture()
  expect(document.querySelector('.first-send-overlay')).toBeNull()
  flight.cancel(); flight.arm('failed')
  expect(isFirstSendTarget('failed')).toBe(false)
  expect(document.querySelector('#source')?.textContent).toBe('draft')
  expect(vi.getTimerCount()).toBe(0)
})
it('survives the accepted source unmount, but cancels if navigation chooses another session', () => {
  const flight = capture(); flight.arm('new'); flight.release()
  expect(isFirstSendTarget('new')).toBe(true)
  expect(document.querySelector('.first-send-overlay [contenteditable]')).toBeNull()
  syncFirstSend('other')
  expect(document.querySelector('.first-send-overlay')).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})
it('does not fly from a source abandoned while the backend was pending', () => {
  const flight = capture(); flight.release(); flight.arm('late')
  expect(isFirstSendTarget('late')).toBe(false)
})
it('expires a slow startup and a destination that never arrives', () => {
  let flight = capture(); vi.advanceTimersByTime(2500); flight.arm('late')
  expect(isFirstSendTarget('late')).toBe(false)
  flight = capture(); flight.arm('new'); syncFirstSend('new'); vi.advanceTimersByTime(1700)
  expect(document.querySelector('.first-send-overlay')).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})
it('reduced motion uses the normal interface', () => {
  document.documentElement.dataset.reduceMotion = 'true'
  expect(capture()).toBeUndefined()
  expect(vi.getTimerCount()).toBe(0)
})
it('restores hidden destinations and cancels animations on resize', () => {
  const flight = capture(); flight.arm('new')
  document.body.insertAdjacentHTML('beforeend', '<main data-first-send-target><div data-user-bubble>draft</div><div data-composer-surface></div><svg class="crab"></svg></main>')
  syncFirstSend('new'); vi.advanceTimersByTime(20)
  expect(document.querySelector('.first-send-carrier')).not.toBeNull()
  window.dispatchEvent(new Event('resize'))
  expect(document.querySelector('[data-first-send-target]')).toBeNull()
  expect(document.querySelector('.first-send-overlay')).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})
it('arms only after successful creation and before the destination route is selected', async () => {
  useDesk.setState({ selectedProjectId: 'p', projects: [{ id: 'p', path: '/tmp', name: 'p', addedAt: 0, collapsed: false }], sessions: {}, view: { kind: 'new' } })
  useChat.setState({ chats: {} })
  window.desk = { chat: { start: vi.fn().mockResolvedValue('new') } } as unknown as Window['desk']
  const created = vi.fn(() => expect(useDesk.getState().view.kind).toBe('new'))
  await useChat.getState().start('draft', undefined, created)
  expect(created).toHaveBeenCalledWith('new')
  expect(useDesk.getState().view).toMatchObject({ kind: 'session', sessionId: 'new' })
  vi.mocked(window.desk.chat.start).mockRejectedValueOnce(new Error('failed'))
  created.mockClear()
  await expect(useChat.getState().start('retry', undefined, created)).rejects.toThrow('failed')
  expect(created).not.toHaveBeenCalled()
})
