// Native Windows engine probe. Default: no model request. --model-check sends
// one fixed, tool-free Haiku prompt with a $0.05 budget and no saved session.
import { query } from '@anthropic-ai/claude-agent-sdk'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const run = promisify(execFile)
const executable = process.env.CLAUDE_PROBE_EXECUTABLE || join(homedir(), '.local', 'bin', 'claude.exe')
const root = await mkdtemp(join(tmpdir(), 'claude-native-probe-'))
const cwd = join(root, '中文 project'); await mkdir(cwd)
const auth = JSON.parse((await run(executable, ['auth', 'status', '--json'], { cwd, windowsHide: true, timeout: 15000 })).stdout)
if (!auth.loggedIn || auth.apiProvider !== 'firstParty') throw new Error('Official authenticated CLI required for this probe')
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 45000)
let release
const held = new Promise(resolve => { release = resolve })
async function* input() { await held }
const options = { cwd, pathToClaudeCodeExecutable: executable, persistSession: false, settingSources: [], tools: [], abortController: controller, env: { ...process.env } }
const q = query({ prompt: input(), options })
try {
  const init = await q.initializationResult()
  console.log(JSON.stringify({ officialAuthentication: true, sdkInitialized: true, cliVersion: init.claude_code_version, modelCount: init.models.length }))
} finally { release(); q.close(); clearTimeout(timeout); controller.abort() }

await new Promise((resolve, reject) => {
  const pty = require('node-pty').spawn(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile'], { cwd, env: { ...process.env }, cols: 80, rows: 24, useConptyDll: true })
  let output = ''
  const timer = setTimeout(() => { pty.kill(); reject(new Error('PTY timeout')) }, 10000)
  pty.onData(data => { output += data })
  pty.onExit(({ exitCode }) => { clearTimeout(timer); if (exitCode === 0 && output.includes('NATIVE_PTY_42')) resolve(); else reject(new Error('PTY output/exit verification failed')) })
  pty.write("Write-Output ('NATIVE_' + 'PTY_' + (6*7)); exit\r")
})
console.log(JSON.stringify({ nativePowerShellPty: true }))
if (process.argv.includes('--model-check')) {
  const modelAbort = new AbortController()
  const timer = setTimeout(() => modelAbort.abort(), 60000)
  const response = query({ prompt: 'Reply exactly WINDOWS_OK. Do not use tools.', options: { ...options, abortController: modelAbort, model: 'haiku', maxTurns: 1, maxBudgetUsd: 0.05, systemPrompt: 'Reply concisely to the given test prompt.' } })
  try {
    let success = false
    for await (const message of response) {
      if (message.type === 'result') {
        success = !message.is_error && message.subtype === 'success' && message.result.trim() === 'WINDOWS_OK'
        console.log(JSON.stringify({ modelRequestSent: true, success, subtype: message.subtype, costUsd: message.total_cost_usd }))
      }
    }
    if (!success) throw new Error('Official model check did not return the expected result')
  } finally { clearTimeout(timer); response.close(); modelAbort.abort() }
}
// Queries are closed and the terminal has exited. node-pty keeps a worker port
// alive after natural exit, so this finite diagnostic explicitly terminates.
process.exit(0)
