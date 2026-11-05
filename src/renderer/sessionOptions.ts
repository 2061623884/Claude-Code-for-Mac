import type { SessionOptions } from '@shared/chat'
import type { Settings } from '@shared/types'

export function defaultSessionOptions(settings: Settings | null): SessionOptions {
  return { model: settings?.defaultModel ?? null, mode: settings?.defaultPermissionMode ?? 'default', effort: settings?.defaultEffort ?? null }
}

/** 草稿只保存显式选择，未覆盖的字段始终使用当前默认值；null 是有效选择。 */
export function draftSessionOptions(state: { settings: Settings | null; draftOverrides: Partial<SessionOptions> }): SessionOptions {
  const options = { ...defaultSessionOptions(state.settings), ...state.draftOverrides }
  return !state.settings?.allowBypass && options.mode === 'bypassPermissions' ? { ...options, mode: 'default' } : options
}
