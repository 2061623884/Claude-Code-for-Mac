import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { observeClaudeConfig, onClaudeConfigChanged, isConfigMutation } from '../src/main/claudeConfigChanges'
let root: string
let unsubscribe: () => void
const emit = vi.fn()
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'config-changes-'))
  mkdirSync(join(root, 'user')); mkdirSync(join(root, '.claude'))
  vi.stubEnv('CLAUDE_CONFIG_DIR', join(root, 'user'))
  emit.mockClear(); unsubscribe = onClaudeConfigChanged(emit)
})
afterEach(() => { unsubscribe(); vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }) })
it('classifies project and user writes without exposing settings contents', () => {
  const changed = observeClaudeConfig(root)
  changed(); expect(emit).not.toHaveBeenCalled()
  writeFileSync(join(root, '.claude/settings.local.json'), '{"language":"Chinese"}')
  changed()
  expect(emit).toHaveBeenLastCalledWith({ cwd: root, scope: 'project' })
  writeFileSync(join(root, 'user/settings.json'), '{"language":"English"}')
  changed()
  expect(emit).toHaveBeenLastCalledWith({ cwd: root, scope: 'user' })
  changed(); expect(emit).toHaveBeenCalledTimes(2)
})
it('invalidates unknown scopes conservatively and also detects partial writes on failure', () => {
  const changed = observeClaudeConfig(root)
  changed(true)
  expect(emit).toHaveBeenLastCalledWith({ cwd: root, scope: 'unknown' })
  writeFileSync(join(root, 'user/.claude.json'), '{}')
  changed(false)
  expect(emit).toHaveBeenLastCalledWith({ cwd: root, scope: 'user' })
})
it('does not classify read-only commands as config mutations', () => {
  for (const text of ['/config', '/output-style', '/autocompact', '/config invalid', '/model opus']) expect(isConfigMutation(text)).toBe(false)
  for (const text of ['/config language=Chinese', '/output-style Concise', '/autocompact auto']) expect(isConfigMutation(text)).toBe(true)
})

it('ignores legacy launch counters and caches so reading settings cannot create a refresh loop', () => {
  const legacy = join(root, 'user/.claude.json')
  writeFileSync(legacy, JSON.stringify({ theme: 'dark', numStartups: 1 }))
  const changed = observeClaudeConfig(root)
  writeFileSync(legacy, JSON.stringify({ theme: 'dark', numStartups: 2, oauthAccount: { marker: 'changed' } }))
  changed()
  expect(emit).not.toHaveBeenCalled()
  writeFileSync(legacy, JSON.stringify({ theme: 'light', numStartups: 3 }))
  changed()
  expect(emit).toHaveBeenCalledWith({ cwd: root, scope: 'user' })
})
