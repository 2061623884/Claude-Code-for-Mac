// 在一个临时会话里执行本地斜杠命令：不调用模型、不写会话记录，只拿它的文字输出。
// 只放行 /config 和带参数的 /autocompact；保存作用域遵循 CLI 的各项规则，项目项使用传入 cwd。
import { observeClaudeConfig } from './claudeConfigChanges'
import { claudeExecutable, loadSdk } from './sdk'
import { temporaryQuery } from './temporaryQuery'
import { withClaudeConfig } from './claudeConfigAccess'
import { persistWorkflowPreference } from './workflowPreference'

const ALLOWED = /^(?:\/config(?:\s+[A-Za-z][\w.-]*=[^\r\n]+)?|\/autocompact\s+(?:auto|reset|unset|default|\d+(?:\.\d+)?[km]?))$/i

export function runLocalCommand(cwd: string, command: string, model?: string | null): Promise<string> {
  if (!ALLOWED.test(command)) return Promise.reject(new Error(`不支持的命令：${command}`))
  if (command.trim() === '/config') return executeConfig(cwd, command, model)
  return withClaudeConfig(async () => {
    const changed = observeClaudeConfig(cwd)
    try {
      const output = await executeConfig(cwd, command, model)
      const workflow = /^\/config\s+workflows=(true|false)$/i.exec(command.trim())
      if (workflow) await persistWorkflowPreference(workflow[1].toLowerCase() === 'true')
      changed(true)
      return output
    } catch (error) { changed(); throw error }
  })
}
async function executeConfig(cwd: string, command: string, model?: string | null): Promise<string> {
  if (!ALLOWED.test(command)) throw new Error(`不支持的命令：${command}`)
  return temporaryQuery(async (abortController) => {
    const sdk = await loadSdk()
    if (abortController.signal.aborted) throw new Error('临时查询已取消')
    return sdk.query({ prompt: command, options: { cwd, model: model ?? undefined, persistSession: false, pathToClaudeCodeExecutable: claudeExecutable(), abortController } })
  }, async (q) => {
    let output = ''
    for await (const m of q) {
      if (m.type === 'stream_event') throw new Error('命令被交给了模型处理，已中止')
      if (m.type === 'assistant') {
        if (m.message.model !== '<synthetic>') throw new Error('命令被交给了模型处理，已中止')
        output += m.message.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n')
      }
      if (m.type === 'result') {
        if (m.is_error) throw new Error(('errors' in m ? m.errors.join('；') : '') || output || '设置未能保存')
        break
      }
    }
    if (!output.trim()) throw new Error('Claude Code 未返回设置结果，请重试')
    if (command.trim() !== '/config' && !/^(?:Set .+ to |.+ is already off\.|Auto-compact window for .+ set to )/i.test(output.trim())) throw new Error(output.trim())
    if (/^(?:Error\b|Unknown (?:setting|key)|Invalid (?:setting|value)|Cannot set|Failed to)/im.test(output)) throw new Error(output.trim())
    return output.trim()
  })
}
