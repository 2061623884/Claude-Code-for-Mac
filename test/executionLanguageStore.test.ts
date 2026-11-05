import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({ directory: '' }))
vi.mock('electron', () => ({ app: { getPath: () => runtime.directory } }))
afterEach(() => { if (runtime.directory) rmSync(runtime.directory, { recursive: true, force: true }) })
it('migrates old preferences to Chinese and preserves English across reloads', async () => {
  runtime.directory = mkdtempSync(join(tmpdir(), 'execution-language-'))
  writeFileSync(join(runtime.directory,'claude-desk.json'), JSON.stringify({ settings: { theme: 'dark' } }))
  vi.resetModules()
  const store = await import('../src/main/store')
  expect(store.read().settings).toMatchObject({ theme: 'dark', executionLanguage: 'zh' })
  store.update(d => { d.settings.executionLanguage = 'en' })
  expect(JSON.parse(readFileSync(join(runtime.directory,'claude-desk.json'),'utf8')).settings.executionLanguage).toBe('en')
  vi.resetModules()
  expect((await import('../src/main/store')).read().settings.executionLanguage).toBe('en')
})
it('recovers an unsupported saved language to Chinese', async () => {
 runtime.directory = mkdtempSync(join(tmpdir(), 'execution-language-'))
 writeFileSync(join(runtime.directory,'claude-desk.json'), JSON.stringify({ settings: { executionLanguage: 'unknown' } }))
 vi.resetModules()
 expect((await import('../src/main/store')).read().settings.executionLanguage).toBe('zh')
})

it('persists every desktop preference across a fresh store instance', async () => {
  runtime.directory = mkdtempSync(join(tmpdir(), 'desktop-settings-'))
  vi.resetModules()
  const store = await import('../src/main/store')
  const settings = { theme: 'dark' as const, autoScroll: false, reduceMotion: true, executionLanguage: 'en' as const, defaultModel: 'sonnet', defaultEffort: 'high' as const, defaultPermissionMode: 'plan' as const, allowBypass: true, notifyCompletion: false, notifyApproval: false, notificationSound: false, claudePath: null }
  store.update(d => { d.settings = settings })
  vi.resetModules()
  expect((await import('../src/main/store')).read().settings).toEqual(settings)
})
