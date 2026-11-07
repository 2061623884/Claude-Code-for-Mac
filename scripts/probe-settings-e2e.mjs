// Opt-in paid model test: isolated configuration, real desktop LiveSession and config writes.
// Run with: node scripts/probe-settings-e2e.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const phase = process.argv[2] || 'language'
assert.ok(['language','compact','compact-resume','workflow','workflow-resume','agents','agents-verify','agents-stop','config'].includes(phase), 'Unknown test phase')
const root = process.env.E2E_ROOT || await mkdtemp(join(tmpdir(), 'desk-settings-e2e-'))
const config = join(root, 'config')
await mkdir(config,{recursive:true})
const originalConfig = process.env.CLAUDE_CONFIG_DIR
const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
if (!originalToken && process.platform === 'darwin') {
  try {
    const credential = JSON.parse(execFileSync('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
    if (credential.claudeAiOauth?.accessToken) process.env.CLAUDE_CODE_OAUTH_TOKEN = credential.claudeAiOauth.accessToken
  } catch { throw new Error('Unable to reuse desktop login without exposing credentials') }
}
const authDir = originalConfig || join(homedir(), '.claude')
try { await copyFile(join(authDir, '.credentials.json'), join(config, '.credentials.json')) } catch (e) { if (e.code !== 'ENOENT') throw e }
process.env.CLAUDE_CONFIG_DIR = config
const cli = resolve('node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude')
const sdkUrl = import.meta.resolve('@anthropic-ai/claude-agent-sdk')
const report = { phase, checks: [], turns: [], costs: {}, root, failures: [] }
const messages = []
globalThis.__settingsE2eMessages = messages
globalThis.__settingsE2eCosts = report.costs
const sdkSource = `
 const dynamicImport = new Function('specifier','return import(specifier)');
 export function claudeExecutable(){return ${JSON.stringify(cli)}}
 export async function loadSdk(){const sdk=await dynamicImport(${JSON.stringify(sdkUrl)});return {...sdk,query(params){
  const q=sdk.query({...params,options:{...params.options,persistSession:params.options?.persistSession ?? true,maxBudgetUsd:0.65,maxTurns:8,
   env:{...process.env,CLAUDE_CONFIG_DIR:${JSON.stringify(config)}},pathToClaudeCodeExecutable:${JSON.stringify(cli)}}});
  const iterator=q[Symbol.asyncIterator].bind(q);
  q[Symbol.asyncIterator]=async function*(){for await(const m of iterator()){
   globalThis.__settingsE2eMessages.push(m);
   if(m.type==='result')globalThis.__settingsE2eCosts[m.session_id]=Math.max(globalThis.__settingsE2eCosts[m.session_id]||0,m.total_cost_usd||0);
   yield m;
  }};return q;}}}
 export async function withIdleQuery(options,fn){const sdk=await loadSdk();const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),15000);
 const q=sdk.query({prompt:(async function*(){await new Promise(r=>ac.signal.addEventListener('abort',r,{once:true}))})(),options:{...options,persistSession:false,abortController:ac}});
 try{return await fn(q)}finally{clearTimeout(timer);q.close();ac.abort()}}
`
let session
let waiting
let turnTimer
const options = { model: 'sonnet', effort: 'low', mode: 'default' }
function check(name, condition) { assert.ok(condition, name); report.checks.push(name); console.log('PASS', name) }
function paidGuard() { assert.ok(Object.values(report.costs).reduce((a,b)=>a+b,0)<2.5,'Total test budget reached') }
try {
 await build({stdin:{contents:`export {LiveSession} from ${JSON.stringify(resolve('src/main/live/LiveSession.ts'))};export {Transcript} from ${JSON.stringify(resolve('src/main/transcript.ts'))};export {runLocalCommand} from ${JSON.stringify(resolve('src/main/localCommand.ts'))};export {readClaudeConfig} from ${JSON.stringify(resolve('src/main/claudeConfigSnapshot.ts'))};`,resolveDir:process.cwd(),sourcefile:'settings-e2e.ts'},outfile:join(root,'app.cjs'),bundle:true,platform:'node',format:'cjs',plugins:[{name:'isolation',setup(b){
 b.onResolve({filter:/^(\.\.\/|\.\/)sdk$/},()=>({path:'sdk',namespace:'e2e'}));
 b.onResolve({filter:/^\.\.\/store$/},()=>({path:'store',namespace:'e2e'}));
 b.onLoad({filter:/^sdk$/,namespace:'e2e'},()=>({contents:sdkSource,loader:'js'}));
 b.onLoad({filter:/^store$/,namespace:'e2e'},()=>({contents:'export function read(){return {settings:{allowBypass:false}}}',loader:'js'}));
 }}]})
 const {LiveSession,Transcript,runLocalCommand,readClaudeConfig}=createRequire(import.meta.url)(join(root,'app.cjs'))
 async function start(id=randomUUID(),resume=false,overrides={}){
  session?.close()
  session=new LiveSession({sessionId:id,cwd:root,resume,options:{...options,...overrides},transcript:new Transcript(root),onClosed:()=>{},emit:e=>{
   if(e.kind==='approval') { void session.respond(e.request.requestId,(e.request.toolName === 'Workflow' || (e.request.toolName === 'Skill' && e.request.input.skill === 'workflow-authoring')) ? {type:'allow'} : {type:'deny',message:'This isolated probe only approves the Workflow tool; do not access files, shell or network.'}); }
   if(e.kind==='result'&&waiting&&e.diagnostic?.userMessageIds.includes(waiting.id)){const w=waiting;waiting=null;clearTimeout(turnTimer);w.resolve(e)}
   if(e.kind==='notice')console.log('NOTICE',e.text.slice(0,200))
  }})
  await session.start();await session.readyForControls();return id
 }
 async function turn(name,prompt){paidGuard();const at=messages.length;const inputId=randomUUID();console.log('RUN',name);const finished=new Promise((resolve,reject)=>{waiting={resolve,reject,id:inputId};turnTimer=setTimeout(()=>{waiting=null;session.close();reject(Error('Turn timed out'))},90000)});session.send(prompt,inputId);const result=await finished;const raw=messages.slice(at);const text=raw.filter(m=>m.type==='assistant').flatMap(m=>m.message.content.filter(c=>c.type==='text').map(c=>c.text)).join('\n');const tools=raw.filter(m=>m.type==='assistant').flatMap(m=>m.message.content.filter(c=>c.type==='tool_use').map(c=>c.name));const boundaries=raw.filter(m=>m.type==='system'&&m.subtype==='compact_boundary').map(m=>m.compact_metadata);const toolResults=raw.filter(m=>m.type==='user'&&Array.isArray(m.message?.content)).flatMap(m=>m.message.content.filter(c=>c.type==='tool_result').map(c=>({error:c.is_error??false,content:JSON.stringify(c.content).slice(0,2000)})));const row={name,text,tools,toolResults,boundaries,error:result.error,costEstimate:Object.values(report.costs).reduce((a,b)=>a+b,0)};report.turns.push(row);console.log(JSON.stringify(row));if(result.error)throw Error(result.error);return row}
 async function workflowDone(expected){
  const deadline=Date.now()+30000
  while(Date.now()<deadline){
   const tasks=[...session.tasks.values()].filter(t=>t.task_type?.includes('workflow')||t.task_id?.startsWith('w'))
   const task=tasks.at(-1)
   if(task&&['completed','failed','stopped'].includes(task.status)){
    const output=await session.taskOutput(task.task_id)
    const record={task,output};report.workflowResults??=[];report.workflowResults.push(record);console.log('WORKFLOW_COMPLETION',JSON.stringify(record))
    check('workflow background task completed',task.status==='completed')
    const result=JSON.parse(output.output).result
    check('workflow output contains computed value',result===expected || (result && Object.values(result).includes(expected)))
    return
   }
   await new Promise(r=>setTimeout(r,200))
  }
  throw Error('Workflow completion not confirmed')
 }
 async function save(key,value){await runLocalCommand(root,`/config ${key}=${value}`);const snap=await readClaudeConfig(root);const actual=snap.items.find(i=>i.key===key);check('saved '+key+'='+value+' (read '+actual?.value+')',actual?.value===value)}
 if(phase==='agents-stop'){
  const id=process.env.E2E_SESSION;assert.ok(id)
  const snap=await readClaudeConfig(root)
  check('saved workflow switch survives restart',snap.items.find(i=>i.key==='workflows')?.value==='true')
  await start(id,true,{model:'sonnet',effort:'low'})
  const roles='Parent agent: run exactly one Workflow with exactly two parallel agent() calls, each model haiku. Child agents reading the relayed user request: the parent ALREADY launched the Workflow. Your ONLY job is your assigned code review, never create or search for Workflow, never delegate and never use tools. '
  const pending=turn('two-agents-stop-after-restart','ultracode. '+roles+'Review the same average function. Child A: produce up to 500 words of edge-case review. Child B: produce up to 500 words of input-validation review. Both must independently reason and return text without tools. Return both results from Workflow. This is a cancellation test: the host may stop the workflow while both children are running. Do not restart it after it is stopped.')
  // Attach a handler immediately while the monitor awaits task progress.
  pending.catch(()=>{})
  let running
  const stopDeadline=Date.now()+60000
  while(Date.now()<stopDeadline){running=[...session.tasks.values()].find(t=>t.task_type==='local_workflow'&&t.status==='running'&&t.workflow_progress?.filter(p=>p.type==='workflow_agent'&&p.agentId&&p.startedAt&&['start','progress','running'].includes(p.state)).length===2);if(running)break;await new Promise(r=>setTimeout(r,50))}
  check('both child agents observed running before stop',!!running)
  report.beforeStop=structuredClone(running)
  await session.stopTask(running.task_id)
  let stopped
  const confirmDeadline=Date.now()+15000
  while(Date.now()<confirmDeadline){stopped=session.tasks.get(running.task_id);if(['stopped','failed','completed'].includes(stopped?.status))break;await new Promise(r=>setTimeout(r,50))}
  check('target workflow stopped',stopped?.status==='stopped')
  report.afterStop=structuredClone(stopped)
  await new Promise(r=>setTimeout(r,500))
  report.afterStop=structuredClone(session.tasks.get(running.task_id))
  report.stoppedOutput=await session.taskOutput(running.task_id).catch(error=>({error:String(error)}))
  console.log('STOP_RESULT',JSON.stringify({before:report.beforeStop,after:report.afterStop,output:report.stoppedOutput}))
  await pending
  const healthy=await turn('conversation-survives-task-stop','Reply only SESSION_OK. Do not start any tools or agents.')
  check('stopping workflow leaves conversation usable',healthy.text.includes('SESSION_OK'))
  report.resumeFixture=true
 }
 if(phase==='agents-verify'){
  await save('workflows','true');await save('workflowKeywordTriggerEnabled','true');await save('workflowSizeGuideline','small')
  const id=await start(process.env.E2E_SESSION,true,{model:'sonnet',effort:'low'})
  report.sessionId=id
  const roles='Parent agent: run exactly one Workflow with exactly two parallel agent() calls, each model haiku. Child agents reading the relayed user request: the parent ALREADY launched the Workflow. Your ONLY job is your assigned code review, never create or search for Workflow, never delegate and never use tools. '
  const task='Review const average = xs => xs.reduce((a,b)=>a+b)/xs.length. Child A checks empty inputs; child B checks string/NaN numeric inputs. Each returns only its finding and corrected code, under 100 words. Return the two reviews as an array from Workflow. Use the workflow-authoring Skill only if needed. No files, shell or network. '
  const row=await turn('two-agents-after-restart','ultracode. '+roles+task)
  check('workflow invoked after restart',row.tools.includes('Workflow'))
  let completed
  const deadline=Date.now()+60000
  while(Date.now()<deadline){completed=[...session.tasks.values()].find(t=>t.task_type==='local_workflow'&&['completed','failed','stopped'].includes(t.status));if(completed)break;await new Promise(r=>setTimeout(r,100))}
  check('two-agent workflow completed',completed?.status==='completed')
  const output=JSON.parse((await session.taskOutput(completed.task_id)).output)
  check('exactly two child agents ran',output.agentCount===2)
  check('both results actually review code',Array.isArray(output.result)&&output.result.length===2&&output.result.every(r=>typeof r==='string'&&r.includes('average')&&!/could not run|tool is not available|cannot.*workflow/i.test(r)))
  report.agentCompletion={task:completed,output};console.log('AGENT_REVIEWS',JSON.stringify(output.result))
  await start(id,true,{model:'sonnet',effort:'low'})
  const pending=turn('two-agents-stop-after-restart','ultracode. '+roles+'Review the same average function. Child A: produce up to 500 words of edge-case review. Child B: produce up to 500 words of input-validation review. Both must independently reason and return text without tools. Return both results from Workflow. This is a cancellation test: the host may stop the workflow while both children are running. Do not restart it after it is stopped.')
  // Attach a handler immediately while the monitor awaits task progress.
  pending.catch(()=>{})
  let running
  const stopDeadline=Date.now()+60000
  while(Date.now()<stopDeadline){running=[...session.tasks.values()].find(t=>t.task_type==='local_workflow'&&t.status==='running'&&t.workflow_progress?.filter(p=>p.type==='workflow_agent'&&p.agentId&&p.startedAt&&['start','progress','running'].includes(p.state)).length===2);if(running)break;await new Promise(r=>setTimeout(r,50))}
  check('both child agents observed running before stop',!!running)
  report.beforeStop=structuredClone(running)
  await session.stopTask(running.task_id)
  let stopped
  const confirmDeadline=Date.now()+15000
  while(Date.now()<confirmDeadline){stopped=session.tasks.get(running.task_id);if(['stopped','failed','completed'].includes(stopped?.status))break;await new Promise(r=>setTimeout(r,50))}
  check('target workflow stopped',stopped?.status==='stopped')
  report.afterStop=structuredClone(stopped)
  await new Promise(r=>setTimeout(r,500))
  report.afterStop=structuredClone(session.tasks.get(running.task_id))
  report.stoppedOutput=await session.taskOutput(running.task_id).catch(error=>({error:String(error)}))
  console.log('STOP_RESULT',JSON.stringify({before:report.beforeStop,after:report.afterStop,output:report.stoppedOutput}))
  await pending
  const healthy=await turn('conversation-survives-task-stop','Reply only SESSION_OK. Do not start any tools or agents.')
  check('stopping workflow leaves conversation usable',healthy.text.includes('SESSION_OK'))
  report.resumeFixture=true
 }
 if(phase==='agents'){
  await save('workflows','true');await save('workflowKeywordTriggerEnabled','true');await save('workflowSizeGuideline','small');await save('autoCompact','false');await save('outputStyle','Concise')
  const id=await start(undefined,false,{model:'sonnet',effort:'low'})
  report.sessionId=id
  const prompt='ultracode. Run one Workflow with exactly TWO parallel agent() calls, each model haiku, no nested agents and no tool use inside agents. Task: review this JavaScript: const average = xs => xs.reduce((a,b)=>a+b)/xs.length. Agent A checks empty inputs and returns a concise finding and correction. Agent B checks numeric input handling and returns a concise finding and correction. Each response must be under 100 words. Return the two reviews as an array from the workflow. Use only Workflow and the workflow-authoring Skill if needed. Do not read or write project files. Do not start more than two agents.'
  const row=await turn('two-agents-after-save',prompt)
  check('real Workflow tool invoked',row.tools.includes('Workflow'))
  const deadline=Date.now()+90000
  let completed
  while(Date.now()<deadline){
    completed=[...session.tasks.values()].find(t=>t.task_type==='local_workflow'&&['completed','failed','stopped'].includes(t.status))
    if(completed)break
    await new Promise(r=>setTimeout(r,200))
  }
  check('workflow completed with two agents',completed?.status==='completed')
  const output=await session.taskOutput(completed.task_id)
  const parsed=JSON.parse(output.output)
  check('exactly two real agents executed',parsed.agentCount===2)
  check('both agent results are available',Array.isArray(parsed.result)&&parsed.result.length===2)
  report.agentCompletion={task:completed,output:parsed};console.log('TWO_AGENT_RESULT',JSON.stringify(report.agentCompletion))
  // Retain the fixture until the cancellation phase has been implemented from observed events.
  report.resumeFixture=true
 }
 if(phase==='language'){
 const id=await start()
 await save('autoCompact','false')
 await save('language','Japanese')
 await save('outputStyle','Explanatory')
 await session.applySetting('language','Japanese');await session.applySetting('outputStyle','Explanatory')
 const first=await turn('language-style-after-save','Fix this JavaScript function and explain the design tradeoff: const average = xs => xs.reduce((a,b)=>a+b)/xs.length; . Show the corrected code in your answer. Do not use tools.')
 check('current reply obeys saved Japanese',/[ぁ-ゖァ-ヺ]/u.test(first.text))
 check('current reply has explanatory insight section',/Insight|インサイト|洞察/.test(first.text))
 await start(id,true)
 const second=await turn('language-style-after-restart','Fix this JavaScript function and explain the design tradeoff: const unique = xs => xs.filter((v,i)=>xs.indexOf(v)===i); . It must handle NaN as a duplicate value. Show corrected code in your answer. Do not use tools.')
 check('resumed reply obeys saved Japanese',/[ぁ-ゖァ-ヺ]/u.test(second.text))
 check('resumed reply obeys saved output style',/Insight|インサイト|洞察/.test(second.text))
 console.log('PHASE language/style complete')
 }
 if(phase==='compact-resume'){
  const id=process.env.E2E_SESSION;assert.ok(id)
  await start(id,true)
  console.log('CONTEXT retry',JSON.stringify(await session.contextUsage()))
  const extra=Array.from({length:1600},(_,i)=>`additional_${i.toString(16)} log ${(i*31).toString(16)}.`).join('\n')
  const next=await turn('automatic-compaction-additional-turn','Keep the remembered project verification code. The next synthetic log is disposable. Reply only with the remembered code.\n'+extra)
  console.log('CONTEXT after retry',JSON.stringify(await session.contextUsage()))
  check('automatic compaction on subsequent turn',next.boundaries.some(b=>b.trigger==='auto'))
  check('memory survives automatic compaction',next.text.includes('ALPINE_729'))
  await start(id,true)
  const last=await turn('summary-restored-after-restart','Reply only with the remembered project verification code.')
  check('compacted memory survives restart',last.text.includes('ALPINE_729'))
 }
 if(phase==='compact'){
  await save('autoCompact','false');await save('outputStyle','Concise');await save('language','English')
  console.log('WINDOW',await runLocalCommand(root,'/autocompact 100k','sonnet'))
  const id=await start()
  report.sessionId=id
  const before=await session.contextUsage();console.log('CONTEXT disabled',JSON.stringify(before))
  check('runtime auto compact disabled',before.autoCompactEnabled===false)
  const filler=Array.from({length:3500},(_,i)=>`record_${i.toString(16)} synthetic checksum ${(i*7919).toString(16)}.`).join('\n')
  const seed=await turn('compact-disabled-load','Remember the project verification code ALPINE_729. The following synthetic log is disposable filler; no need to analyze it. Reply only READY.\n'+filler)
  check('disabled auto compact did not summarize',seed.boundaries.length===0)
  const filled=await session.contextUsage();console.log('CONTEXT filled',JSON.stringify(filled))
  await save('autoCompact','true')
  await start(id,true)
  const enabled=await session.contextUsage();console.log('CONTEXT enabled',JSON.stringify(enabled))
  check('restarted runtime auto compact enabled',enabled.autoCompactEnabled===true)
  let compacted=await turn('compact-enabled-after-restart','What is the project verification code I asked you to remember? Reply only with that code.')
  if(!compacted.boundaries.some(b=>b.trigger==='auto')) compacted=await turn('compact-next-turn','Keep the remembered verification code. This is disposable input. Reply only with the code.\n'+Array.from({length:1600},(_,i)=>`additional_${i.toString(16)} log ${(i*31).toString(16)}.`).join('\n'))
  check('real automatic compaction event',compacted.boundaries.some(b=>b.trigger==='auto'))
  check('memory survives automatic compaction',compacted.text.includes('ALPINE_729'))
  await start(id,true)
  const resumed=await turn('compact-summary-after-second-restart','Return the project verification code again, with no explanation.')
  check('compacted memory survives process restart',resumed.text.includes('ALPINE_729'))
 }
 if(phase==='config'){
  console.log('WINDOW',await runLocalCommand(root,'/autocompact 100k','sonnet'))
  const current=JSON.parse(await readFile(join(config,'settings.json'),'utf8'));console.log('WINDOW_SAVED',JSON.stringify(current.modelSettings))
  await start();console.log('WINDOW_CONTEXT',JSON.stringify(await session.contextUsage()))
  for(const value of ['false','true']){
   console.log('WRITE',value,await runLocalCommand(root,`/config workflows=${value}`))
   const snap=await readClaudeConfig(root);console.log('READ',JSON.stringify(snap.items.filter(i=>i.key==='workflows')))
   await start(undefined,false,{model:'opus',effort:'high'})
   const state=await session.configurationState()
   console.log('EFFECTIVE',JSON.stringify({enableWorkflows:state.effective?.enableWorkflows,disableWorkflows:state.effective?.disableWorkflows,applied:state.applied}))
   for(const name of ['settings.json','.claude.json']){try{const d=JSON.parse(await readFile(join(config,name),'utf8'));console.log('FILE',name,JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k])=>/workflow/i.test(k)))))}catch{}}
  }
 }
 if(phase==='workflow-resume'){
  const id=process.env.E2E_SESSION;assert.ok(id)
  await start(id,true,{model:'opus',effort:'high'})
  const again=await turn('workflow-completion-after-restart','ultracode. Use the Workflow tool to compute and verify 3+4=7. No Agent calls, files, shell, network or other tools. Report only the result after the workflow completes.')
  check('restarted workflow really invoked',again.tools.includes('Workflow'))
  check('restarted workflow launch accepted',again.toolResults.some(r=>!r.error)&&again.toolResults.every(r=>!r.error))
  await workflowDone(7)
 }
 if(phase==='workflow'){
  await save('autoCompact','false');await save('outputStyle','Concise');await save('language','English')
  await save('workflows','false');await save('workflowKeywordTriggerEnabled','false')
  const id=await start(undefined,false,{model:'opus',effort:'high'})
  const off=await turn('workflow-disabled','ultracode. If a Workflow tool is available use it to compute 2+3 without agents, files, shell or network. Otherwise reply WORKFLOW_DISABLED. Do not call any other tools.')
  check('disabled workflow not invoked',!off.tools.includes('Workflow'))
  await save('workflows','true');await save('workflowKeywordTriggerEnabled','true');await save('workflowSizeGuideline','small')
  await start(id,true,{model:'opus',effort:'high'})
  const on=await turn('workflow-enabled-after-save-and-reload','ultracode. Use the Workflow tool to compute and verify 2+3=5 with the smallest possible workflow. No Agent calls, files, shell, network or other tools. Report only the result after the workflow completes.')
  check('enabled workflow really invoked',on.tools.includes('Workflow'))
  check('workflow launch accepted',on.toolResults.some(r=>!r.error)&&on.toolResults.every(r=>!r.error))
  await workflowDone(5)
  await start(id,true,{model:'opus',effort:'high'})
  const again=await turn('workflow-enabled-after-second-restart','ultracode. Use the Workflow tool again to compute and verify 3+4=7. No Agent calls, files, shell, network or other tools. Report only the result after the workflow completes.')
  check('restarted workflow really invoked',again.tools.includes('Workflow'))
  check('restarted workflow launch accepted',again.toolResults.some(r=>!r.error)&&again.toolResults.every(r=>!r.error))
  await workflowDone(7)
 }

} catch(error){report.failures.push(String(error));console.error(String(error));process.exitCode=1}
finally{
 clearTimeout(turnTimer);session?.close()
 report.taskEvents=messages.filter(m=>m.type==='system'&&(m.subtype?.startsWith('task_')||m.subtype==='background_tasks_changed'))
 const reportFile=join(tmpdir(),`claude-desk-settings-e2e-${phase}.json`)
 await writeFile(reportFile,JSON.stringify(report,null,2));console.log('REPORT',reportFile)
 if(originalToken===undefined)delete process.env.CLAUDE_CODE_OAUTH_TOKEN;else process.env.CLAUDE_CODE_OAUTH_TOKEN=originalToken
 if(originalConfig===undefined)delete process.env.CLAUDE_CONFIG_DIR;else process.env.CLAUDE_CONFIG_DIR=originalConfig
 await rm(join(config,'.credentials.json'),{force:true})
 if(report.failures.length||report.resumeFixture) console.log('ISOLATED_FIXTURE',root)
 else await rm(root,{recursive:true,force:true})
}
