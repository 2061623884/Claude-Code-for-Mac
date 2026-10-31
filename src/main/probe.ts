// 阶段 0 专用：验证 SDK 在 Electron 主进程里能否正常工作。运行：npm run probe
// 测试会话不落盘（persistSession: false），不会混进用户的历史会话。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { CanUseTool, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { claudeExecutable, loadSdk } from './sdk'
import { PushQueue } from './live/PushQueue'

const log = (...args: unknown[]): void => console.log('[probe]', ...args)

function userMessage(text: string): SDKUserMessage {
  return { type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null }
}

export async function runProbe(): Promise<void> {
  const sdk = await loadSdk()
  const scratch = join(app.getPath('temp'), 'claude-desk-probe')
  mkdirSync(scratch, { recursive: true })

  // (a) 历史会话
  const sessions = await sdk.listSessions()
  const byCwd = new Map<string, number>()
  for (const s of sessions) byCwd.set(s.cwd ?? '(无 cwd)', (byCwd.get(s.cwd ?? '(无 cwd)') ?? 0) + 1)
  log(`listSessions: 共 ${sessions.length} 个会话`)
  for (const [cwd, n] of byCwd) log(`  ${n}\t${cwd}`)
  const sample = sessions[0]
  if (sample) log('  字段示例:', Object.keys(sample).join(', '))

  // (b) 流式输入会话
  const permissionRequests: unknown[] = []
  const canUseTool: CanUseTool = async (toolName, input, options) => {
    const { signal: _signal, ...rest } = options
    permissionRequests.push({ toolName, input, options: rest })
    log(`canUseTool: ${toolName}`, JSON.stringify(input).slice(0, 300))
    if (toolName === 'ExitPlanMode') return { behavior: 'deny', message: '仅测试，结束。', interrupt: true }
    return { behavior: 'allow', updatedInput: input }
  }

  const input = new PushQueue<SDKUserMessage>()
  const q = sdk.query({
    prompt: input,
    options: {
      cwd: scratch,
      model: 'haiku',
      permissionMode: 'default',
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      includePartialMessages: true,
      persistSession: false,
      pathToClaudeCodeExecutable: claudeExecutable(),
      canUseTool,
      stderr: (data) => log('stderr:', data.trim().slice(0, 300))
    }
  })

  const messages: SDKMessage[] = []
  const waiter: { resolve: (() => void) | null; interruptOnStream: boolean } = { resolve: null, interruptOnStream: false }
  const pump = (async () => {
    for await (const m of q) {
      messages.push(m)
      if (m.type !== 'stream_event') log(`消息: ${m.type}${'subtype' in m ? '/' + m.subtype : ''}`)
      if (m.type === 'stream_event' && waiter.interruptOnStream) {
        waiter.interruptOnStream = false
        log('调用 interrupt()')
        void q.interrupt()
      }
      if (m.type === 'result') {
        waiter.resolve?.()
        waiter.resolve = null
      }
    }
  })().catch((err) => log('会话流以错误结束:', String(err).slice(0, 200)))
  const turn = (text: string): Promise<void> =>
    new Promise((resolve) => {
      waiter.resolve = resolve
      input.push(userMessage(text))
    })

  const init = await q.initializationResult()
  log('initializationResult 字段:', Object.keys(init).join(', '))
  const models = await q.supportedModels()
  log('supportedModels:', models.map((m) => `${m.value}(${m.displayName})`).join(', '))
  log('supportedCommands 数量:', (await q.supportedCommands()).length)
  const account = await q.accountInfo()
  log('accountInfo:', JSON.stringify({
    subscriptionType: account.subscriptionType,
    tokenSource: account.tokenSource,
    apiKeySource: account.apiKeySource,
    apiProvider: account.apiProvider
  }))

  // (c) 简单回复
  await turn('只回复 OK，不要做任何其他事。')
  if (process.argv.includes('--quick')) {
    input.end()
    await pump
    log('快速模式完成')
    return
  }
  // (d) 写文件触发权限确认
  await turn('用 Write 工具在当前目录创建 hello.txt，内容为 hi。')
  // (e) 计划模式下的 ExitPlanMode
  await q.setPermissionMode('plan')
  await turn('制定一个计划：在 hello.txt 末尾追加一行 bye。不要执行，直接调用 ExitPlanMode 提交计划。')
  // (f) 拒绝并中断后，会话是否还能继续
  await q.setPermissionMode('default')
  await turn('只回复 OK2。')
  // (g) 运行中途 interrupt()（「停止」按钮）后，会话是否还能继续
  waiter.interruptOnStream = true
  await turn('从 1 数到 200，每行一个数字。')
  await turn('只回复 OK3。')

  input.end()
  await pump

  const fixtures = join(process.cwd(), 'test', 'fixtures')
  mkdirSync(fixtures, { recursive: true })
  writeFileSync(join(fixtures, 'probe-messages.json'), JSON.stringify(messages, null, 2))
  writeFileSync(join(fixtures, 'probe-permissions.json'), JSON.stringify(permissionRequests, null, 2))
  log(`完成：${messages.length} 条消息、${permissionRequests.length} 次权限请求，已写入 test/fixtures/`)
}
