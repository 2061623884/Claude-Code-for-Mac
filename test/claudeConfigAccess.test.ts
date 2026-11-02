import { expect, it } from 'vitest'
import { withClaudeConfig } from '../src/main/claudeConfigAccess'

it('orders a snapshot after an in-flight write, and subsequent writes after the entire snapshot', async () => {
  const order: string[] = []
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const write = withClaudeConfig(async () => { order.push('write:start'); await gate; order.push('write:end') })
  const read = withClaudeConfig(async () => { order.push('read'); return 'current value' })
  const next = withClaudeConfig(async () => { order.push('next write') })
  await Promise.resolve()
  expect(order).toEqual(['write:start'])
  release()
  expect(await read).toBe('current value')
  await Promise.all([write, next])
  expect(order).toEqual(['write:start', 'write:end', 'read', 'next write'])
})

it('does not poison future reads or writes after a failed operation', async () => {
  const failed = withClaudeConfig(async () => { throw new Error('disk full') })
  const next = withClaudeConfig(async () => 'recovered')
  await expect(failed).rejects.toThrow('disk full')
  await expect(next).resolves.toBe('recovered')
})
