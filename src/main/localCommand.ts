// 在一个临时会话里执行本地斜杠命令：不调用模型、不写会话记录，只拿它的文字输出。
// 只放行 /config：它改的是全局设置，不依赖哪个会话；别的命令可能会交给模型处理。
import { claudeExecutable, loadSdk } from './sdk'
import { temporaryQuery } from './temporaryQuery'

const ALLOWED = /^\/config(\s+[A-Za-z][\w.-]*=[^\n]+)?$/

export async function runLocalCommand(cwd: string, command: string): Promise<string> {
  if (!ALLOWED.test(command)) throw new Error(`不支持的命令：${command}`)
  return temporaryQuery(async (abortController) => {
    const sdk = await loadSdk()
    if (abortController.signal.aborted) throw new Error('临时查询已取消')
    return sdk.query({ prompt: command, options: { cwd, persistSession: false, pathToClaudeCodeExecutable: claudeExecutable(), abortController } })
  }, async (q) => {
    let output = ''
    for await (const m of q) {
      if (m.type === 'stream_event') throw new Error('命令被交给了模型处理，已中止')
      if (m.type === 'assistant') {
        if (m.message.model !== '<synthetic>') throw new Error('命令被交给了模型处理，已中止')
        output += m.message.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n')
      }
      if (m.type === 'result') break
    }
    return output.trim()
  })
}
