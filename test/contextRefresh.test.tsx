// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useContextUsage } from '../src/renderer/hooks/useContextUsage'
import type { ContextUsage } from '../src/shared/chat'
afterEach(() => { cleanup(); vi.useRealTimers() })
it('refreshes active sessions without overlapping requests and rejects stale session responses', async () => {
  vi.useFakeTimers()
  const pending: ((value: ContextUsage) => void)[] = []
  const context = vi.fn(() => new Promise<ContextUsage>(resolve => pending.push(resolve)))
  window.desk = { chat: { context } } as unknown as Window['desk']
  const sample = (used: number) => ({ used, max: 200_000, percent: 1, parts: [] })
  const { result, rerender } = renderHook(({ id }) => useContextUsage(id, '/tmp', 'sonnet', true, false), { initialProps: { id: 'one' } })
  await act(async () => { vi.advanceTimersByTime(30_000) })
  expect(context).toHaveBeenCalledTimes(1)
  await act(async () => { pending[0](sample(100)) })
  expect(result.current?.used).toBe(100)
  await act(async () => { vi.advanceTimersByTime(10_000) })
  expect(context).toHaveBeenCalledTimes(2)
  rerender({ id: 'two' })
  expect(result.current).toBeNull()
  await act(async () => { pending[1](sample(200)); pending[2](sample(300)) })
  expect(result.current?.used).toBe(300)
})
