export interface ClaudeConfigItem {
  key: string
  values: string[]
  value: string | null
  source: 'saved' | 'default' | 'environment' | 'unknown'
  locked?: string
}
export interface ClaudeConfigSnapshot { items: ClaudeConfigItem[]; cliVersion: string }

/** Invalidation only: consumers must reread, never infer save success from this event. */
export interface ClaudeConfigChange {
  cwd: string
  scope: 'project' | 'user' | 'unknown'
}
