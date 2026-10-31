// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ContextBreakdown } from '../src/renderer/components/chat/ContextMeter'
afterEach(cleanup)
it('labels the window and threshold separately and does not infer a disabled or unknown threshold', () => {
  const usage = { used: 100_000, max: 200_000, percent: 50, parts: [], free: 67_000, buffer: 33_000 }
  const { rerender } = render(<ContextBreakdown usage={{ ...usage, autoCompactEnabled: true, autoCompactThreshold: 167_000 }} />)
  expect(screen.getByText(/有效统计窗口/).textContent).toContain('20 万')
  expect(screen.getByText(/触发阈值/).textContent).toContain('16.7 万')
  expect(screen.getByText('6.7 万')).toBeTruthy()
  rerender(<ContextBreakdown usage={{ ...usage, autoCompactEnabled: false }} />)
  expect(screen.getByText(/已关闭/)).toBeTruthy()
  expect(screen.queryByText(/触发阈值/)).toBeNull()
  rerender(<ContextBreakdown usage={usage} />)
  expect(screen.getByText(/状态未知/)).toBeTruthy()
})
