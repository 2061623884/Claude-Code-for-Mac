// 整个应用里唯一引入 Claude Agent SDK 的地方。
// SDK 只提供 ESM，主进程打包成 CJS，所以用动态 import 加载。
import { join } from 'node:path'
import type { Options, Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { app } from 'electron'
import { PushQueue } from './live/PushQueue'
import * as store from './store'

export type Sdk = typeof import('@anthropic-ai/claude-agent-sdk')

let sdk: Promise<Sdk> | undefined

export function loadSdk(): Promise<Sdk> {
  return (sdk ??= import('@anthropic-ai/claude-agent-sdk'))
}

/**
 * claude 可执行文件路径：设置里的自定义路径优先；
 * 打包后 SDK 会把路径解析到 app.asar 里面（无法执行），要改指向解包出来的副本。
 */
export function claudeExecutable(): string | undefined {
  const custom = store.read().settings.claudePath
  if (custom) return custom
  if (!app.isPackaged) return undefined
  return join(
    process.resourcesPath,
    'app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude'
  )
}

const idleQueries = new Set<AbortController>()
export function closeIdleQueries(): void { for (const abort of idleQueries) abort.abort() }

/** 只做控制查询；不发送模型消息。查询完成即清理，不等待消息流排空。 */
export async function withIdleQuery<T>(options: Options, fn: (q: Query) => Promise<T>): Promise<T> {
  const abort = new AbortController()
  idleQueries.add(abort)
  const cancel = () => abort.abort()
  options.abortController?.signal.addEventListener('abort', cancel, { once: true })
  if (options.abortController?.signal.aborted) cancel()
  const input = new PushQueue<SDKUserMessage>()
  let q: Query | undefined, timer: ReturnType<typeof setTimeout> | undefined
  const cancelled = new Promise<never>((_, reject) => {
    const fail = () => reject(new Error('会话信息查询已取消'))
    if (abort.signal.aborted) fail(); else abort.signal.addEventListener('abort', fail, { once: true })
    timer = setTimeout(() => { reject(new Error('会话信息查询超时')); abort.abort() }, 15000)
  })
  try {
    const sdk = await Promise.race([loadSdk(), cancelled])
    if (abort.signal.aborted) throw new Error('会话信息查询已取消')
    q = sdk.query({ prompt: input, options: { ...options, persistSession: false, pathToClaudeCodeExecutable: options.pathToClaudeCodeExecutable ?? claudeExecutable(), abortController: abort } })
    return await Promise.race([fn(q), cancelled])
  } finally {
    clearTimeout(timer)
    input.end()
    try { q?.close() } finally {
      abort.abort(); idleQueries.delete(abort)
      options.abortController?.signal.removeEventListener('abort', cancel)
    }
  }
}
