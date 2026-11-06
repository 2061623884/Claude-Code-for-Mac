import { query } from '@anthropic-ai/claude-agent-sdk'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const root = await mkdtemp(join(tmpdir(), 'desk-controls-probe-'))
buildSync({ entryPoints:[resolve('src/main/permissionRules.ts')], outfile:join(root,'rules.cjs'), bundle:true, platform:'node', format:'cjs' })
const { changeRule } = createRequire(import.meta.url)(join(root,'rules.cjs'))
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 20000)
await mkdir(join(root,'config'))
const q = query({
  prompt: (async function* () { await new Promise(r => controller.signal.addEventListener('abort',r,{once:true})) })(),
  options: {cwd:root, persistSession:false, abortController:controller, env:{...process.env, CLAUDE_CONFIG_DIR:join(root,'config')}, pathToClaudeCodeExecutable:resolve('node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude')}
})
try {
  const init = await q.initializationResult()
  console.log('CLI', init.claude_code_version)
  const change = {source:'localSettings', behavior:'allow', rule:'Bash(echo controls-probe)'}
  for (const remove of [false,true]) {
    await changeRule(root,{...change,remove})
    await q.reinitialize()
    let matched = false
    for (let attempt=0;attempt<30;attempt++) {
      const response=await q.request({subtype:'list_permission_rules'})
      const rules=response.state?.rules??response.response?.state?.rules
      if (!rules) throw Error('permission protocol unsupported')
      const exists=rules.some(r=>r.rule===change.rule)
      if(exists===!remove){matched=true;break}
      await new Promise(r=>setTimeout(r,100))
    }
    if(!matched)throw Error('permission rule not reflected after '+(remove?'revoke':'add'))
    console.log('PASS permission',remove?'revoke':'add')
  }
} finally {clearTimeout(timer);q.close();controller.abort();await rm(root,{recursive:true,force:true})}
