// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ModePicker } from '../src/renderer/components/newSession/ModePicker'
import { useDesk } from '../src/renderer/store'
const options = { model: 'opus', mode: 'default' as const, effort: null }
beforeEach(() => {
  useDesk.setState({ demo: null, settings: null })
  window.desk = { meta: { cachedModels: vi.fn().mockResolvedValue(null), get: vi.fn().mockResolvedValue({ models: [], claudeVersion: null, subscriptionType: null }) } } as unknown as Window['desk']
})
afterEach(cleanup)
it('does not present an unknown Fast state as an actionable off switch', () => {
  const retry = vi.fn()
  render(<ModePicker inline="fast" live options={options} runtime={{ error: 'unavailable' }} onChange={vi.fn()} onRetry={retry} />)
  expect((screen.getByRole('checkbox', { name: 'Fast' }) as HTMLInputElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(retry).toHaveBeenCalledOnce()
})
it('allows the SDK opt-in and explains its meaning', () => {
  const change = vi.fn()
  render(<ModePicker inline="fast" live options={options} runtime={{ fastMode: 'off', fastModeReason: 'sdk_opt_in_required' }} onChange={change} />)
  expect(screen.queryByText('需要在当前会话开启快速模式')).toBeNull()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Fast' }))
  expect(change).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '确认开启' }))
  expect(change).toHaveBeenCalledWith({ fastMode: true })
})

it('explains billing and allows cancellation without changing Fast', () => {
  const change = vi.fn()
  render(<ModePicker inline="fast" live options={options} runtime={{ fastMode: 'off', fastModeReason: 'extra_usage_disabled' }} onChange={change} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Fast' }))
  expect(screen.getByRole('dialog', { name: '开启 Fast 模式？' })).toBeTruthy()
  expect(screen.getByRole('link', { name: '打开 Claude 用量设置' }).getAttribute('href')).toBe('https://claude.ai/settings/usage')
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(change).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('turns Fast off without a billing confirmation', () => {
  const change = vi.fn()
  render(<ModePicker inline="fast" live options={options} runtime={{ fastMode: 'on' }} onChange={change} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Fast' }))
  expect(change).toHaveBeenCalledWith({ fastMode: false })
  expect(screen.queryByRole('dialog')).toBeNull()
})
