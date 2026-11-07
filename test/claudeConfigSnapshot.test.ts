import { expect, it, vi } from 'vitest'
import { readClaudeConfig } from '../src/main/claudeConfigSnapshot'
import { onClaudeConfigChanged } from '../src/main/claudeConfigChanges'
import { runLocalCommand } from '../src/main/localCommand'

const fixture = vi.hoisted(() => ({ invalid: false, language: 'English', order: [] as string[], write: Promise.resolve() }))
vi.mock('node:fs/promises', () => ({ readFile: async () => '{}' }))
vi.mock('../src/main/sdk', () => ({
  claudeExecutable: () => undefined,
  loadSdk: async () => ({
    query: ({ prompt }: { prompt: string }) => ({
      close() {},
      async *[Symbol.asyncIterator]() {
        if (prompt !== '/config') {
          fixture.order.push('write:start')
          await fixture.write
          fixture.language = 'Chinese'
          fixture.order.push('write:end')
        }
        yield { type: 'assistant', message: { model: '<synthetic>', content: [{ type: 'text', text: prompt === '/config' ? 'Usage: /config key=value\n  language=<value>' : fixture.invalid ? 'Invalid value' : 'Set language to Chinese' }] } }
        yield { type: 'result', is_error: false }
      }
    })
  }),
  withIdleQuery: async (_options: unknown, read: (query: unknown) => Promise<unknown>) => {
    fixture.order.push('snapshot')
    return read({
      initializationResult: async () => ({ claude_code_version: '2.1.301' }),
      request: async () => ({ response: { effective: { language: fixture.language }, sources: [] } })
    })
  }
}))

it('routes a complete config snapshot through the same queue as native writes', async () => {
  let release!: () => void
  fixture.write = new Promise(resolve => { release = resolve })
  const write = runLocalCommand('/project-a', '/config language=Chinese')
  const snapshot = readClaudeConfig('/project-b')
  await vi.waitFor(() => expect(fixture.order).toEqual(['write:start']))
  release()
  await write
  expect((await snapshot).items).toEqual([{ key: 'language', values: [], value: 'Chinese', source: 'saved' }])
  expect(fixture.order).toEqual(['write:start', 'write:end', 'snapshot'])
})

it('notifies settings consumers only after a validated native save', async () => {
  const changed = vi.fn()
  const unsubscribe = onClaudeConfigChanged(changed)
  try {
    await runLocalCommand('/project-a', '/config')
    expect(changed).not.toHaveBeenCalled()
    await runLocalCommand('/project-a', '/config language=Chinese')
    expect(changed).toHaveBeenCalledWith({ cwd: (await import('node:path')).resolve('/project-a'), scope: 'unknown' })
    changed.mockClear()
    fixture.invalid = true
    await expect(runLocalCommand('/project-a', '/config language=invalid')).rejects.toThrow('Invalid value')
    expect(changed).not.toHaveBeenCalled()
  } finally { unsubscribe(); fixture.invalid = false }
})
