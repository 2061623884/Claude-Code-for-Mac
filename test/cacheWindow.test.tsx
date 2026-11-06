// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TokenUsage, UiMessage } from '../src/shared/chat'
import { cacheExpiresAt, cacheMinutesLeft } from '../src/shared/cacheWindow'
import { Composer } from '../src/renderer/components/newSession/Composer'

const usage = (cacheTtl?: TokenUsage['cacheTtl']): TokenUsage => ({ input: 1, output: 1, cacheRead: 0, cacheWrite: 0, ...(cacheTtl ? { cacheTtl } : {}) })
const msg = (patch: Partial<UiMessage>): UiMessage => ({ id: String(Math.random()), role: 'assistant', blocks: [], parentToolUseId: null, ...patch })
const MIN = 60_000

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('cacheExpiresAt', () => {
  it('starts from the latest main-thread request and uses its detected tier', () => {
    expect(cacheExpiresAt([msg({ time: 1000, usage: usage('5m') })])).toBe(1000 + 5 * MIN)
    expect(cacheExpiresAt([msg({ time: 1000, usage: usage('1h') })])).toBe(1000 + 60 * MIN)
  })
  it('inherits the last known tier when the latest request only read the cache', () => {
    expect(cacheExpiresAt([msg({ time: 1000, usage: usage('5m') }), msg({ time: 9000, usage: usage() })])).toBe(9000 + 5 * MIN)
  })
  it('defaults to one hour and ignores subagents, users and messages without usage', () => {
    expect(cacheExpiresAt([
      msg({ time: 1000, usage: usage() }),
      msg({ time: 5000, usage: usage('5m'), parentToolUseId: 'tool' }),
      msg({ time: 6000, role: 'user' }),
      msg({ time: 7000 })
    ])).toBe(1000 + 60 * MIN)
    expect(cacheExpiresAt([msg({ role: 'user', time: 1 })])).toBeUndefined()
  })
  it('rounds remaining time up to whole minutes and stops at zero', () => {
    expect(cacheMinutesLeft(60 * MIN, 0)).toBe(60)
    expect(cacheMinutesLeft(60 * MIN, 1)).toBe(60)
    expect(cacheMinutesLeft(60 * MIN, 59 * MIN + 1)).toBe(1)
    expect(cacheMinutesLeft(60 * MIN, 60 * MIN)).toBe(0)
    expect(cacheMinutesLeft(60 * MIN, 90 * MIN)).toBe(0)
  })
})

describe('Composer cache countdown', () => {
  const view = (cacheExpiresAt?: number) => (
    <Composer value="" onChange={() => {}} attachments={[]} onAttachmentsChange={() => {}} onSubmit={async () => {}}
      canSubmit submitHint="发送" chips={null} cacheExpiresAt={cacheExpiresAt} />
  )
  it('shows no badge without cache', () => {
    const { container } = render(view())
    expect(container.querySelector('[data-cache-badge]')).toBeNull()
    expect(container.querySelector('[data-composer-surface]')?.getAttribute('data-cache')).toBeNull()
  })
  it('counts down by whole minutes, then turns cold at 0m', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const { container } = render(view(2 * MIN))
    const surface = () => container.querySelector('[data-composer-surface]')!
    expect(screen.getByText('2m')).toBeTruthy()
    expect(surface().getAttribute('data-cache')).toBe('warm')
    act(() => { vi.advanceTimersByTime(MIN) })
    expect(screen.getByText('1m')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(MIN) })
    expect(screen.getByText('0m')).toBeTruthy()
    expect(surface().getAttribute('data-cache')).toBe('cold')
  })
})
