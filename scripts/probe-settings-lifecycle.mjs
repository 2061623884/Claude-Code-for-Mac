// Isolated settings lifecycle probe. Uses synthetic /config commands only; no model prompts.
import assert from 'node:assert/strict'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const root = await mkdtemp(join(tmpdir(), 'desk-settings-lifecycle-'))
const config = join(root, 'config')
await mkdir(config)
const paths = {autoCompact:'autoCompactEnabled',language:'language',outputStyle:'outputStyle',thinking:'alwaysThinkingEnabled',useAutoModeDuringPlan:'useAutoModeDuringPlan',switchModelsOnFlag:'switchModelsOnFlag',workflows:'enableWorkflows',workflowKeywordTriggerEnabled:'workflowKeywordTriggerEnabled',workflowSizeGuideline:'workflowSizeGuideline',worktreeBaseRef:'worktree'}
const options={cwd:root,persistSession:false,env:{...process.env,CLAUDE_CONFIG_DIR:config},pathToClaudeCodeExecutable:resolve('node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude')}
async function run(prompt,read,desktop=false){const abortController=new AbortController();const timer=setTimeout(()=>abortController.abort(),15000);const q=query({prompt,options:{...options,...(desktop?{model:'opus',permissionMode:'default',effort:'high',settings:{},enableFileCheckpointing:true,systemPrompt:{type:'preset',preset:'claude_code'}}:{}),abortController}});try{return await read(q)}finally{q.close();abortController.abort();clearTimeout(timer)}}
const idle=()=> (async function*(){await new Promise(()=>{})})()
try{
 for(const [key,value] of Object.entries({autoCompact:'false',language:'Chinese',outputStyle:'Learning',thinking:'false',useAutoModeDuringPlan:'false',switchModelsOnFlag:'Ask each time',workflows:'false',workflowKeywordTriggerEnabled:'false',workflowSizeGuideline:'small',worktreeBaseRef:'head'})){
  const output=await run(`/config ${key}=${value}`,async q=>{let text='';for await(const m of q){if(m.type==='assistant'){if(m.message.model!=='<synthetic>')throw Error('Unexpected model response');text+=m.message.content.filter(c=>c.type==='text').map(c=>c.text).join('')}if(m.type==='result')break}return text.trim()})
  const state=await run(idle(),q=>q.request({subtype:'get_settings'}),true)
  const s=state.response??state
  if (key === 'thinking') {
   assert.match(output, /Thinking can't be turned off/)
   console.log('PASS unsupported Opus thinking toggle rejected')
   continue
  }
  assert.match(output, /^Set /, key + ' save failed')
  let actual = s.effective?.[paths[key]]
  if(key === 'worktreeBaseRef') actual = actual?.baseRef
  if(key === 'workflowSizeGuideline') actual = JSON.parse(await readFile(join(config,'.claude.json'),'utf8')).workflowSizeGuideline
  const expected = key === 'switchModelsOnFlag' ? false : ['true','false'].includes(value) ? value === 'true' : value
  assert.equal(actual, expected, key + ' did not persist into a new desktop process')
  console.log('PASS save + fresh desktop process', key)

 }
 const state=await run(idle(),q=>q.request({subtype:'get_settings'}),true)
 const s=state.response??state
 assert.equal(s.effective.language, 'Chinese')
 assert.equal(s.effective.autoCompactEnabled, false)
 assert.equal(s.effective.enableWorkflows, false)
 console.log('PASS final restart preserves saved defaults')
 const override = await run(idle(), async q => { await q.applyFlagSettings({enableWorkflows:true}); return q.request({subtype:'get_settings'}) }, true)
 assert.equal((override.response??override).effective.enableWorkflows,true)
 console.log('PASS explicit session workflow choice overrides default')
 for(const name of ['settings.json','.claude.json']){try{const data=JSON.parse(await readFile(join(config,name),'utf8'));console.log('PERSISTED',name,JSON.stringify(Object.fromEntries(Object.values(paths).filter(k=>k in data).map(k=>[k,data[k]]))))}catch{}}
}finally{await rm(root,{recursive:true,force:true})}
