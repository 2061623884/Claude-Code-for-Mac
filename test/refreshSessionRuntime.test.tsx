// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { refreshSessionRuntime } from '../src/renderer/refreshSessionRuntime'
it('starts historical session controls before refreshing and propagates startup failures', async () => {
  const calls: string[] = []
  const prepareControls = vi.fn(async () => { calls.push('prepare') })
  const refreshRuntime = vi.fn(async () => { calls.push('refresh') })
  window.desk = { chat: { prepareControls, refreshRuntime } } as unknown as Window['desk']
  await refreshSessionRuntime('history', '/project')
  expect(calls).toEqual(['prepare', 'refresh'])
  expect(prepareControls).toHaveBeenCalledWith('history', '/project')
  expect(refreshRuntime).toHaveBeenCalledWith('history')
  prepareControls.mockRejectedValueOnce(new Error('startup failed'))
  await expect(refreshSessionRuntime('history', '/project')).rejects.toThrow('startup failed')
  expect(refreshRuntime).toHaveBeenCalledTimes(1)
  await expect(refreshSessionRuntime('history')).rejects.toThrow('无法确定')
  expect(prepareControls).toHaveBeenCalledTimes(2)
})
