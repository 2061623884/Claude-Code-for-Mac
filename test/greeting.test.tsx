// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_HISTORY, GREETINGS, HISTORY_KEY, greetingName, nextGreeting, periodAt, selectGreeting } from '../src/renderer/greeting'
import { useDesk } from '../src/renderer/store'
import { useUsage } from '../src/renderer/usageStore'
const date = (hour: number, day = 2) => new Date(2026, 10, day, hour)
beforeEach(() => {
  vi.restoreAllMocks()
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k), clear: () => data.clear() })
  localStorage.setItem(HISTORY_KEY, JSON.stringify(EMPTY_HISTORY))
})

it('uses local time boundaries, and neutral copy overnight', () => {
  expect([0, 4, 5, 10, 11, 12, 13, 17, 18, 23].map(periodAt)).toEqual([undefined, undefined, 'morning', 'morning', 'noon', 'noon', 'afternoon', 'afternoon', 'evening', 'evening'])
  for (const hour of [0, 4]) {
    const r = selectGreeting(EMPTY_HISTORY, date(hour), null, () => 0)
    expect(GREETINGS.find(c => c.id === r.id)?.period).toBeUndefined()
  }
})
it('prefers a time greeting on the first entry of a new local day', () => {
  const first = selectGreeting(EMPTY_HISTORY, date(9), 'Link', () => 0)
  expect(first.text).toBe('早上好，Link')
  const next = selectGreeting(first.history, date(15, 3), 'Link', () => 0)
  expect(next.id.startsWith('afternoon-')).toBe(true)
  expect(next.history.named).toBe(false)
})
it('excludes the last five phrase families across time and name variants', () => {
  let history = EMPTY_HISTORY
  for (let i = 0; i < 300; i++) {
    const r = selectGreeting(history, date([9, 12, 15, 20, 2][i % 5]!), 'Link', () => 0)
    expect(history.recent).not.toContain(r.group)
    expect(history.named && r.history.named).toBe(false)
    history = r.history
  }
})
it('falls back to general copy when the time pool is exhausted', () => {
  const result = selectGreeting({ day: '', recent: ['hello', 'chat', 'start'], named: false }, date(9), null, () => 0)
  expect(GREETINGS.find(c => c.id === result.id)?.period).toBeUndefined()
})
it('uses 30% time category and 25% eligible-name thresholds after first entry', () => {
  const history = { day: '2026-11-2', recent: [], named: false }
  const random = (...values: number[]) => vi.fn(() => values.shift() ?? 0)
  expect(selectGreeting(history, date(9), 'Link', random(0.29, 0, 0.24)).text).toBe('早上好，Link')
  expect(selectGreeting(history, date(9), 'Link', random(0.29, 0, 0.25)).text).toBe('早上好')
  expect(selectGreeting(history, date(9), null, random(0.3, 0)).text).toBe('今天想聊些什么？')
})
it('reuses existing identity in priority order and filters unsuitable identifiers', () => {
  expect(greetingName('小林', 'link@example.com', 'local')).toBe('小林')
  expect(greetingName(null, 'link@example.com', 'local')).toBe('link')
  expect(greetingName('本机用户', '123456789@example.com', 'local')).toBe('local')
  for (const bad of ['a'.repeat(21), 'abc\nxyz', 'abc\u202exyz', 'a123456789', 'deadbeef01234567', '/Users/link', '123456']) expect(greetingName(bad)).toBeNull()
})
it('persists only phrase history, not identity, and honors it after a module reload', async () => {
  nextGreeting('SensitiveName')
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY)!)
  expect(localStorage.getItem(HISTORY_KEY)).not.toContain('SensitiveName')
  vi.resetModules()
  const fresh = await import('../src/renderer/greeting')
  fresh.nextGreeting('SensitiveName')
  const after = JSON.parse(localStorage.getItem(HISTORY_KEY)!)
  expect(after.recent).toHaveLength(2)
  expect(after.recent[1]).not.toBe(history.recent[0])
})
it('repairs corrupt history and safely handles inaccessible storage', () => {
  localStorage.setItem(HISTORY_KEY, '{bad')
  expect(nextGreeting(null)).toBe('今天想做点什么？')
  expect(localStorage.getItem(HISTORY_KEY)).toBeNull()
  vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('denied') })
  expect(nextGreeting(null)).toBe('今天想做点什么？')
})

describe('desk navigation', () => {
  beforeEach(() => {
    useUsage.setState({ overview: null })
    useDesk.setState({ greeting: 'existing', username: 'local', meta: null, metaError: null, projects: [{ id: 'p', name: 'p', path: '/tmp', addedAt: 0, collapsed: false }], view: { kind: 'new' }, selectedProjectId: 'p' })
  })
  it('changes on explicit new chat even when already on the new page', () => {
    useDesk.getState().newChat()
    const first = useDesk.getState().greeting
    useDesk.getState().newChat()
    expect(useDesk.getState().greeting).not.toBe(first)
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY)!).recent).toHaveLength(2)
  })
  it('stays stable across settings, project/model changes, sidebar, and late metadata', () => {
    useDesk.getState().newChat()
    const before = useDesk.getState().greeting
    const history = localStorage.getItem(HISTORY_KEY)
    useDesk.getState().setView({ kind: 'settings' })
    useDesk.getState().setView({ kind: 'new' })
    useDesk.getState().setDraft({ projectId: 'p', model: 'sonnet' })
    useDesk.getState().toggleSidebar()
    useDesk.setState({ meta: { email: 'later@example.com', models: [], subscriptionType: null, claudeVersion: null } })
    expect(useDesk.getState().greeting).toBe(before)
    expect(localStorage.getItem(HISTORY_KEY)).toBe(history)
  })
  it('does not consume history before a project exists', () => {
    localStorage.clear()
    useDesk.setState({ projects: [] })
    useDesk.getState().newChat()
    expect(useDesk.getState().greeting).toBe('今天想做点什么？')
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull()
  })
})

it('keeps a fallback greeting stable when returning from settings', () => {
  localStorage.setItem(HISTORY_KEY, 'broken')
  useDesk.setState({ projects: [{ id: 'p', name: 'p', path: '/tmp', addedAt: 0, collapsed: false }] })
  useDesk.getState().newChat()
  useDesk.getState().setView({ kind: 'settings' })
  useDesk.getState().setView({ kind: 'new' })
  expect(useDesk.getState().greeting).toBe('今天想做点什么？')
  expect(localStorage.getItem(HISTORY_KEY)).toBeNull()
})

it('keeps deduplication in memory when storage writes fail', async () => {
  vi.resetModules()
  const fresh = await import('../src/renderer/greeting')
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
  vi.spyOn(Math, 'random').mockReturnValue(0)
  const first = fresh.nextGreeting(null)
  expect(fresh.nextGreeting(null)).not.toBe(first)
})
