// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComposerCrab, nextVerb } from '../src/renderer/components/newSession/ComposerCrab'
import { crabActivity } from '../src/renderer/components/newSession/crabActivity'
import { SPINNER_VERBS } from '../src/renderer/components/newSession/spinnerVerbs'
import type { ChatActivity } from '../src/shared/chat'

const activity = (phase: ChatActivity['phase'], toolName?: string): ChatActivity => ({ revision: 1, phase, toolName })
const pose = () => document.querySelector('[data-crab-pose]')?.getAttribute('data-crab-pose')
const word = () => document.querySelector('.composer-crab-verb')?.textContent
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms))
beforeEach(() => vi.useFakeTimers())
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('composer crab', () => {
  it('sleeps after 30 seconds, wakes with a draft or attachment, and restarts the idle clock', () => {
    const view = render(<ComposerCrab hasDraft={false} />)
    tick(29_999); expect(pose()).toBe('idle')
    tick(1); expect(pose()).toBe('sleep')
    view.rerender(<ComposerCrab hasDraft />); expect(pose()).toBe('look')
    tick(60_000); expect(pose()).toBe('look')
    view.rerender(<ComposerCrab hasDraft={false} />); expect(pose()).toBe('idle')
    tick(30_000); expect(pose()).toBe('sleep')
    view.unmount(); expect(vi.getTimerCount()).toBe(0)
  })
  it('gives execution priority over queued draft editing, and resets after completion', () => {
    const view = render(<ComposerCrab hasDraft={false} state="running" activity={activity('thinking')} />)
    tick(60_000); expect(pose()).toBe('thinking')
    view.rerender(<ComposerCrab hasDraft state="running" activity={activity('responding')} />)
    expect(pose()).toBe('writing'); expect(screen.getByRole('status').textContent).toBe('Responding')
    view.rerender(<ComposerCrab hasDraft={false} state="idle" />)
    expect(pose()).toBe('idle'); tick(30_000); expect(pose()).toBe('sleep')
  })
  it('rotates without repeats, does not restart on phase changes, and pauses for approval', () => {
    const view = render(<ComposerCrab hasDraft={false} state="running" />)
    const first = word(); tick(4000)
    view.rerender(<ComposerCrab hasDraft state="running" activity={activity('thinking')} />)
    expect(word()).toBe(first); tick(4000); expect(word()).not.toBe(first)
    const second = word()
    view.rerender(<ComposerCrab hasDraft state="awaiting" activity={activity('thinking')} />)
    expect(pose()).toBe('waiting'); expect(word()).toBeUndefined(); expect(vi.getTimerCount()).toBe(0)
    tick(60_000)
    view.rerender(<ComposerCrab hasDraft state="running" />)
    expect(word()).toBe(second)
    tick(24_000); expect(document.querySelector('.composer-crab-shimmer')).not.toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Working')
    tick(8000); expect(document.querySelector('.composer-crab-shimmer')).toBeNull()
    view.unmount(); expect(vi.getTimerCount()).toBe(0)
  })
  it('resets on session replacement and never sleeps during errors or stopping', () => {
    const view = render(<ComposerCrab key="a" hasDraft={false} />)
    tick(30_000); expect(pose()).toBe('sleep')
    view.rerender(<ComposerCrab key="b" hasDraft={false} />); expect(pose()).toBe('idle')
    view.rerender(<ComposerCrab key="b" hasDraft={false} state="error" />)
    tick(60_000); expect(pose()).toBe('error'); expect(vi.getTimerCount()).toBe(0)
    view.rerender(<ComposerCrab key="b" hasDraft={false} state="running" activity={activity('stopping')} />)
    expect(screen.getByRole('status').textContent).toBe('Stopping…'); expect(vi.getTimerCount()).toBe(0)
  })
  it.each([
    ['Write', 'writing', 'Writing'], ['Edit', 'writing', 'Writing'], ['MultiEdit', 'writing', 'Writing'], ['NotebookEdit', 'writing', 'Writing'],
    ['Read', 'look', 'Reading'], ['Glob', 'look', 'Searching'], ['Grep', 'look', 'Searching'], ['Bash', 'working', 'Running command'],
    ['Agent', 'working', 'Delegating'], ['Task', 'working', 'Delegating'], ['mcp__custom__Write', 'working', 'Working']
  ])('maps %s only from the actual event', (tool, expectedPose, label) => {
    expect(crabActivity('running', activity('tool', tool))).toEqual({ pose: expectedPose, label, rotating: true })
  })
  it('ignores stale phases after completion and prioritizes waiting and errors', () => {
    expect(crabActivity('idle', activity('thinking')).label).toBe('')
    expect(crabActivity('awaiting', activity('tool', 'Write')).label).toBe('Waiting for you')
    expect(crabActivity('error', activity('thinking')).label).toBe('Error')
    expect(crabActivity('running').label).toBe('Working')
  })
  it('keeps the complete versioned vocabulary and excludes the previous selection', () => {
    expect(SPINNER_VERBS).toHaveLength(187)
    expect(new Set(SPINNER_VERBS).size).toBe(187)
    expect(SPINNER_VERBS).toContain('Whatchamacalliting')
    expect(SPINNER_VERBS).toContain('Clauding')
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(nextVerb(SPINNER_VERBS[0])).toBe(SPINNER_VERBS[1])
  })
})
