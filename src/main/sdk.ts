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

/** 启动一个不发消息的会话，只做查询（不耗额度、不写会话文件），查完让子进程正常退出 */
export async function withIdleQuery<T>(options: Options, fn: (q: Query) => Promise<T>): Promise<T> {
  const sdk = await loadSdk()
  const input = new PushQueue<SDKUserMessage>()
  const q = sdk.query({
    prompt: input,
    options: { persistSession: false, pathToClaudeCodeExecutable: claudeExecutable(), ...options }
  })
  try {
    return await fn(q)
  } finally {
    input.end()
    for await (const _ of q) {
      // 排空消息，让子进程正常退出
    }
  }
}
