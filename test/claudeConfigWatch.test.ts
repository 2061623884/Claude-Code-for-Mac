import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeClaudeConfigWatchers, onClaudeConfigChanged, watchClaudeConfig } from '../src/main/claudeConfigChanges'
let root = ''
afterEach(() => { closeClaudeConfigWatchers(); vi.unstubAllEnvs(); if (root) rmSync(root, { recursive: true, force: true }) })
it('observes external project and user writes, including new and atomically replaced directories', async () => {
  root = mkdtempSync(join(tmpdir(), 'config-watch-'))
  const user = join(root, 'user'), project = join(root, 'project')
  mkdirSync(user); mkdirSync(project)
  vi.stubEnv('CLAUDE_CONFIG_DIR', user)
  const events = vi.fn(), unsubscribe = onClaudeConfigChanged(events)
  try {
    watchClaudeConfig(project); watchClaudeConfig(project)
    await new Promise(resolve => setTimeout(resolve, 150))
    mkdirSync(join(project, '.claude'))
    writeFileSync(join(project, '.claude/settings.json'), '{}')
    await vi.waitFor(() => expect(events).toHaveBeenCalledWith({ cwd: project, scope: 'project' }))
    events.mockClear()
    await new Promise(resolve => setTimeout(resolve, 100))
    writeFileSync(join(user, 'temp'), '{"language":"Chinese"}')
    renameSync(join(user, 'temp'), join(user, 'settings.json'))
    await vi.waitFor(() => expect(events).toHaveBeenCalledWith({ cwd: project, scope: 'user' }))
    events.mockClear()
    await new Promise(resolve => setTimeout(resolve, 100))
    rmSync(join(project, '.claude'), { recursive: true })
    await vi.waitFor(() => expect(events).toHaveBeenCalledWith({ cwd: project, scope: 'project' }))
    events.mockClear()
    await new Promise(resolve => setTimeout(resolve, 100))
    mkdirSync(join(project, '.claude'))
    writeFileSync(join(project, '.claude/settings.local.json'), '{}')
    await vi.waitFor(() => expect(events).toHaveBeenCalledWith({ cwd: project, scope: 'project' }))
  } finally { unsubscribe() }
})
