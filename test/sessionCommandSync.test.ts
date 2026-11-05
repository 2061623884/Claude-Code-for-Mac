import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SessionManager } from '../src/main/live/SessionManager'
import { PushQueue } from '../src/main/live/PushQueue'
import { sessionCommand, parseDesktopCommand } from '../src/shared/sessionCommand'
import type { SessionPreferences } from '../src/main/sessionPreferences'

const sdk = vi.hoisted(() => ({ query: vi.fn(), getSessionMessages: vi.fn() }))
vi.mock('../src/main/sdk', () => ({ loadSdk: async () => sdk, claudeExecutable: () => undefined }))
vi.mock('../src/main/store', () => ({ read: () => ({ settings: { allowBypass: false } }) }))
const options = { model: 'opus', mode: 'default' as const, effort: 'high' as const, fastMode: false }
const saved = new Map<string, SessionPreferences>()
const repository = { load: (id: string) => saved.get(id), save: (id: string, data: SessionPreferences) => { saved.set(id, structuredClone(data)) } }
let manager: SessionManager
let blocked = false
beforeEach(() => {
  saved.clear(); vi.clearAllMocks(); blocked = false
  sdk.getSessionMessages.mockResolvedValue([])
  sdk.query.mockImplementation(({ options: init }) => {
    let fast = !!init.settings.fastMode
    const stream = new PushQueue<unknown>()
    const initializationResult = async () => ({ fast_mode_state: fast ? 'on' : 'off', models: [], commands: [] })
    return Object.assign(stream, {
      close: () => stream.end(), initializationResult,
      reinitialize: vi.fn(async () => ({ fast_mode_state: blocked ? 'off' : fast ? 'on' : 'off', fast_mode_disabled_reason: blocked ? 'extra_usage_disabled' : undefined })),
      applyFlagSettings: vi.fn(async (patch) => { if (patch.fastMode !== undefined) fast = patch.fastMode }),
      request: async () => ({ response: { effective: {}, sources: [], applied: { model: 'opus', effort: 'high' } } })
    })
  })
  manager = new SessionManager(vi.fn(), undefined, undefined, undefined, repository)
})
afterEach(() => manager.closeAll())

it('classifies bare Fast locally and validates arguments', () => {
  expect(sessionCommand('/fast on')).toEqual({ fastMode: true })
  expect(sessionCommand('/fast off')).toEqual({ fastMode: false })
  expect(parseDesktopCommand('/fast')).toEqual({ kind: 'panel', panel: 'fast' })
  expect(() => sessionCommand('/fast invalid')).toThrow('用法')
})
it('uses the button control path, persists and restores explicit Fast changes without sending a prompt', async () => {
  const id = manager.start('/tmp', 'hello', options)
  await manager.send(id, '/tmp', '/fast on', options)
  expect((await manager.open(id, '/tmp'))).toMatchObject({ options: { fastMode: true }, runtime: { fastMode: 'on' }, messages: [expect.anything()] })
  expect(saved.get(id)?.options?.fastMode).toBe(true)
  manager.closeAll()
  manager = new SessionManager(vi.fn(), undefined, undefined, undefined, repository)
  await manager.prepareControls(id, '/tmp')
  expect((await manager.open(id, '/tmp'))).toMatchObject({ options: { fastMode: true }, runtime: { fastMode: 'on' } })
  await manager.setFastMode(id, false)
  expect((await manager.open(id, '/tmp'))).toMatchObject({ options: { fastMode: false }, runtime: { fastMode: 'off' } })
})
it('preserves saved options and rolls back rejected CLI flags', async () => {
  const id = manager.start('/tmp', 'hello', options)
  await manager.prepareControls(id, '/tmp')
  blocked = true
  await expect(manager.send(id, '/tmp', '/fast on', options)).rejects.toThrow('额外用量')
  expect(saved.get(id)?.options?.fastMode).toBe(false)
  expect((await manager.open(id, '/tmp')).runtime?.fastMode).toBe('off')
  expect(sdk.query.mock.results[0].value.applyFlagSettings).toHaveBeenLastCalledWith({ fastMode: false })
})

it('does not allow a config command to create a chat session', () => {
  expect(() => manager.start('/tmp', '/config language=Chinese', options)).toThrow('设置指令')
  expect(sdk.query).not.toHaveBeenCalled()
})
