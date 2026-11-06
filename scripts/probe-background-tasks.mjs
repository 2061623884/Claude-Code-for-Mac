import { query } from '@anthropic-ai/claude-agent-sdk'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const cwd = await mkdtemp(join(tmpdir(), 'desk-tasks-'))
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 45000)
let first, second, stopped = false, passed = false
const q = query({
  prompt: 'Start exactly two independent background Bash tasks. Each must execute sleep 20, with run_in_background true. Do not wait for either task. Reply started.',
  options: { cwd, model:'haiku', persistSession:false, maxTurns:6, tools:['Bash'],
    canUseTool:async (_name,input)=>({behavior:'allow',updatedInput:input}),
    abortController:controller, pathToClaudeCodeExecutable:resolve('node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude') }
})
try {
  console.log('CLI', (await q.initializationResult()).claude_code_version)
  for await(const event of q) {
    if (event.type !== 'system' || event.subtype !== 'background_tasks_changed') continue
    const tasks = event.tasks.filter(t => t.task_type === 'local_bash')
    if (!first && tasks.length >= 2) {
      first = tasks[0].task_id
      second = tasks[1].task_id
      await q.stopTask(first)
      stopped = true
      continue
    }
    if (stopped && tasks.some(t => t.task_id === second) && !tasks.some(t => t.task_id === first)) {
      passed = true
      console.log('PASS stopping one background shell leaves the other running')
      break
    }
  }
  if(!passed)throw Error('two-task isolation not verified')
}finally{
  clearTimeout(timer)
  if(second)await q.stopTask(second).catch(()=>{})
  q.close();controller.abort()
  await rm(cwd,{recursive:true,force:true})
}
