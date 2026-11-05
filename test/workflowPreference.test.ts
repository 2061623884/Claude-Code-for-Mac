import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { persistWorkflowPreference } from '../src/main/workflowPreference'
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
it('persists an explicit on value after the CLI has cleared the plan default', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workflow-pref-')); directories.push(dir)
  const path = join(dir, 'settings.json')
  await writeFile(path, JSON.stringify({ language: 'Chinese', permissions: { allow: ['Read'] } }))
  await persistWorkflowPreference(true, dir)
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ language: 'Chinese', permissions: { allow: ['Read'] }, enableWorkflows: true })
  await persistWorkflowPreference(false, dir)
  expect(JSON.parse(await readFile(path, 'utf8')).enableWorkflows).toBe(false)
})
it('does not replace malformed settings with a partial file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workflow-pref-')); directories.push(dir)
  const path = join(dir, 'settings.json')
  await writeFile(path, 'invalid')
  await expect(persistWorkflowPreference(true, dir)).rejects.toThrow()
  expect(await readFile(path, 'utf8')).toBe('invalid')
})
