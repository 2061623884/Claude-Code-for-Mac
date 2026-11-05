import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

/** The native "on" command can delete enableWorkflows to restore a plan default.
 * Desktop switches represent explicit choices, so persist the supported setting.
 * Called inside withClaudeConfig after the CLI validates the command.
 */
export async function persistWorkflowPreference(enabled: boolean, directory = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')): Promise<void> {
  const path = join(directory, 'settings.json')
  let settings: Record<string, unknown> = {}
  try { settings = JSON.parse(await readFile(path, 'utf8')) }
  catch (error: any) { if (error.code !== 'ENOENT') throw error }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('用户配置格式无效')
  if (settings.enableWorkflows === enabled) return
  await mkdir(directory, { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify({ ...settings, enableWorkflows: enabled }, null, 2) + '\n', { mode: 0o600 })
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }) }
}
