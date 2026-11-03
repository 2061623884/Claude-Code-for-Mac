// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { ModePicker } from '../src/renderer/components/newSession/ModePicker'
import { useDesk } from '../src/renderer/store'
import { sessionCommand } from '../src/shared/sessionCommand'
import type { ModelOption } from '../src/shared/types'
import type { SessionOptions } from '../src/shared/chat'

const opus: ModelOption = { value: 'opus', label: 'Opus', efforts: ['high'] }
const meta = (models: ModelOption[]) => ({ models, claudeVersion: null, subscriptionType: null })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function Harness({ cwd = '/project' }: { cwd?: string }) {
  const [options, setOptions] = useState<SessionOptions>({ model: 'opus', mode: 'default', effort: null })
  return <ModePicker cwd={cwd} options={options} onChange={patch => setOptions(o => ({ ...o, ...patch }))} />
}
beforeEach(() => {
  useDesk.setState({ demo: null, settings: null })
  Object.defineProperty(window, 'desk', { configurable: true, value: { meta: { cachedModels: vi.fn(async () => [opus]), get: vi.fn(async () => meta([opus])) } } })
})
afterEach(cleanup)

it('uses cached model capability while the live query is pending and keeps Ultracode selected', async () => {
  const live = deferred<ReturnType<typeof meta>>()
  vi.mocked(window.desk.meta.get).mockReturnValue(live.promise)
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: '选择思考程度' }))
  await screen.findByRole('button', { name: '高' })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Ultracode' }))
  fireEvent.click(screen.getByRole('button', { name: '高' }))
  fireEvent.click(screen.getByRole('button', { name: '选择思考程度' }))
  expect((screen.getByRole('checkbox', { name: 'Ultracode' }) as HTMLInputElement).checked).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '自动' }))
  await act(async () => live.resolve(meta([opus])))
})
it('uses identical patches for commands and buttons', () => {
  expect(sessionCommand('/effort ultracode')).toEqual({ ultracode: true })
  expect(sessionCommand('/effort ultracode off')).toEqual({ ultracode: false })
  expect(sessionCommand('/effort auto')).toEqual({ effort: null })
  expect(sessionCommand('/effort high')).toEqual({ effort: 'high' })
})
it('keeps automatic available and exposes a retry when loading fails', async () => {
  vi.mocked(window.desk.meta.cachedModels).mockResolvedValue(null)
  vi.mocked(window.desk.meta.get).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(meta([opus]))
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: '选择思考程度' }))
  expect(screen.getByRole('button', { name: '自动' })).toBeTruthy()
  fireEvent.click(await screen.findByRole('button', { name: /读取失败/ }))
  await screen.findByRole('button', { name: '高' })
})
it('ignores late results from another project and late cached data', async () => {
  const old = deferred<ReturnType<typeof meta>>()
  const cache = deferred<ModelOption[] | null>()
  vi.mocked(window.desk.meta.cachedModels).mockImplementation(cwd => cwd === '/other' ? cache.promise : Promise.resolve(null))
  vi.mocked(window.desk.meta.get).mockImplementation(cwd => cwd === '/other' ? Promise.resolve(meta([{ value: 'opus', label: 'New', efforts: ['low'] }])) : old.promise)
  const view = render(<Harness />)
  view.rerender(<Harness cwd="/other" />)
  fireEvent.click(screen.getByRole('button', { name: '选择思考程度' }))
  await screen.findByRole('button', { name: '低' })
  await act(async () => { old.resolve(meta([opus])); cache.resolve([opus]) })
  await waitFor(() => expect(screen.queryByRole('button', { name: '高' })).toBeNull())
})

it('shows a cache that arrives after live failure and retains the retry', async () => {
  const cache = deferred<ModelOption[] | null>()
  vi.mocked(window.desk.meta.cachedModels).mockReturnValue(cache.promise)
  vi.mocked(window.desk.meta.get).mockRejectedValue(new Error('offline'))
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: '选择思考程度' }))
  await screen.findByRole('button', { name: /读取失败/ })
  await act(async () => cache.resolve([opus]))
  expect(screen.getByRole('button', { name: '高' })).toBeTruthy()
  expect(screen.getByText('显示上次结果')).toBeTruthy()
})
it('allows retry after an empty response', async () => {
  vi.mocked(window.desk.meta.cachedModels).mockResolvedValue(null)
  vi.mocked(window.desk.meta.get).mockResolvedValueOnce(meta([])).mockResolvedValue(meta([opus]))
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
  fireEvent.click(await screen.findByRole('button', { name: /没有可用模型/ }))
  await screen.findByRole('button', { name: 'Opus' })
})
it('discards an old CLI response when the executable changes', async () => {
  const old = deferred<ReturnType<typeof meta>>()
  vi.mocked(window.desk.meta.cachedModels).mockResolvedValue(null)
  vi.mocked(window.desk.meta.get).mockReturnValueOnce(old.promise).mockResolvedValue(meta([{ ...opus, efforts: ['low'] }]))
  render(<Harness />)
  act(() => useDesk.setState({ settings: { theme: 'system', defaultModel: 'opus', defaultEffort: null, defaultPermissionMode: 'default', claudePath: '/new', allowBypass: false } }))
  fireEvent.click(screen.getByRole('button', { name: '选择思考程度' }))
  await screen.findByRole('button', { name: '低' })
  await act(async () => old.resolve(meta([opus])))
  expect(screen.queryByRole('button', { name: '高' })).toBeNull()
})
