export interface ClaudeConfigItem {
  key: string
  values: string[]
  value: string | null
  source: 'saved' | 'default' | 'environment' | 'unknown'
  locked?: string
}
export interface ClaudeConfigSnapshot { items: ClaudeConfigItem[]; cliVersion: string }
