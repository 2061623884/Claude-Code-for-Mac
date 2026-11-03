import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { withClaudeConfig } from './claudeConfigAccess'

export interface RuleChange { source: string; behavior: string; rule: string; remove?: boolean }
export function changeRule(cwd: string, change: RuleChange): Promise<void> {
  return withClaudeConfig(async () => {
    if (!['allow', 'ask', 'deny'].includes(change.behavior) || !change.rule.trim() || /[\r\n\0]/.test(change.rule)) throw new Error('无效权限规则')
    const paths: Record<string, string> = {
      userSettings: join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json'),
      projectSettings: join(cwd, '.claude/settings.json'),
      localSettings: join(cwd, '.claude/settings.local.json')
    }
    const path = paths[change.source]
    if (!path) throw new Error('该来源无法编辑')
    let settings: Record<string, any> = {}
    try { settings = JSON.parse(await readFile(path, 'utf8')) }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('配置文件格式无效')
    const permissions = settings.permissions ?? {}
    const old = permissions[change.behavior] ?? []
    if (!Array.isArray(old) || !old.every(r => typeof r === 'string')) throw new Error('权限规则格式无效')
    permissions[change.behavior] = change.remove ? old.filter(r => r !== change.rule) : [...new Set([...old, change.rule])]
    settings.permissions = permissions
    await mkdir(dirname(path), { recursive: true })
    const temporary = path + '.' + randomUUID() + '.tmp'
    await writeFile(temporary, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 })
    await rename(temporary, path)
  })
}
