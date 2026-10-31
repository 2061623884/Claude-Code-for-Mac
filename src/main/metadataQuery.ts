import type { SDKControlInitializeResponse } from '@anthropic-ai/claude-agent-sdk'
import { loadSdk, claudeExecutable } from './sdk'
import { temporaryQuery } from './temporaryQuery'
export { closeTemporaryQueries as closeMetadataQueries } from './temporaryQuery'

export function readMetadata(cwd: string, signal?: AbortSignal): Promise<SDKControlInitializeResponse> {
  return temporaryQuery(async (abortController, input) => {
    const sdk = await loadSdk()
    if (abortController.signal.aborted) throw new Error('临时查询已取消')
    return sdk.query({ prompt: input, options: { cwd, persistSession: false, pathToClaudeCodeExecutable: claudeExecutable(), abortController } })
  }, (query) => query.initializationResult(), signal)
}
