/** Desktop contracts contain application data, never SDK response envelopes. */
export interface PermissionRule {
  rule: string
  behavior: 'allow' | 'ask' | 'deny'
  source: string
  editability: 'persistent' | 'session' | 'readonly'
}
export interface PermissionRules { rules: PermissionRule[]; managedOnly: boolean }
export interface RuleChange {
  source: 'userSettings' | 'projectSettings' | 'localSettings'
  behavior: PermissionRule['behavior']
  rule: string
  remove?: boolean
}
export type LiveSetting = 'outputStyle' | 'language' | 'thinking'
export type DiffSource = 'working' | 'branch'
export interface TaskOutput { output: string; truncated?: boolean }
export interface FileRewindResult {
  canRewind: boolean
  error?: string
  filesChanged?: string[]
  insertions?: number
  deletions?: number
  skippedLinks?: number
}
