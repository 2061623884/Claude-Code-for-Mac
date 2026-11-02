import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { UsageAccount, UsageProfile } from '../shared/usageAnalytics'

export function usageAccount(account: { email?: string; organization?: string; subscriptionType?: string; apiProvider?: string }): UsageAccount {
  const key = createHash('sha256').update(JSON.stringify([account.apiProvider ?? 'firstParty', account.email ?? 'local', account.organization ?? ''])).digest('hex')
  return { key, email: account.email ?? null, organization: account.organization ?? null, subscriptionType: account.subscriptionType ?? null }
}
export function defaultProfile(account: UsageAccount): UsageProfile { return { name: account.email?.split('@')[0] || '本机用户', avatar: null } }
export class UsageProfiles {
  constructor(private directory: string) {}
  private path(key: string): string {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('账户标识无效')
    return join(this.directory, key + '.json')
  }
  async get(account: UsageAccount): Promise<UsageProfile> {
    try { return this.validate(JSON.parse(await readFile(this.path(account.key), 'utf8'))) }
    catch (e: any) { if (e.code === 'ENOENT') return defaultProfile(account); throw e }
  }
  private validate(value: unknown): UsageProfile {
    const p = value as UsageProfile
    if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80) throw new Error('名称应为 1–80 个字符')
    if (p.avatar !== null && (typeof p.avatar !== 'string' || p.avatar.length > 500000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.avatar))) throw new Error('头像格式无效')
    return { name: p.name.trim(), avatar: p.avatar }
  }
  async save(key: string, value: unknown): Promise<UsageProfile> {
    const profile = this.validate(value), path = this.path(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path + '.tmp', JSON.stringify(profile))
    await rename(path + '.tmp', path)
    return profile
  }
}
