import type { Query, SDKControlInitializeResponse, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { loadSdk, claudeExecutable } from './sdk'
import { PushQueue } from './live/PushQueue'

const activeQueries = new Set<AbortController>()
export function closeMetadataQueries(): void { for (const controller of activeQueries) controller.abort() }

/** 元信息查询不发送消息；初始化完成即关闭独立查询，不等待流排空。 */
export async function readMetadata(cwd: string, signal?: AbortSignal): Promise<SDKControlInitializeResponse> {
  const abortController = new AbortController()
  activeQueries.add(abortController)
  const cancel = (): void => abortController.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  let timer: ReturnType<typeof setTimeout> | undefined
  let query: Query | undefined
  const input = new PushQueue<SDKUserMessage>()
  const cancelled = new Promise<never>((_, reject) => {
    const fail = (): void => reject(new Error('元信息查询已取消'))
    if (abortController.signal.aborted) fail()
    else abortController.signal.addEventListener('abort', fail, { once: true })
    timer = setTimeout(() => { reject(new Error('元信息查询超时')); cancel() }, 15_000)
  })
  try {
    const sdk = await Promise.race([loadSdk(), cancelled])
    if (abortController.signal.aborted) throw new Error('元信息查询已取消')
    query = sdk.query({ prompt: input, options: { cwd, persistSession: false, pathToClaudeCodeExecutable: claudeExecutable(), abortController } })
    return await Promise.race([query.initializationResult(), cancelled])
  } finally {
    activeQueries.delete(abortController)
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
    input.end()
    try { query?.close() } finally { abortController.abort() }
  }
}
