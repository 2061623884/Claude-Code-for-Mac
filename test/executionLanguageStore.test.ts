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
