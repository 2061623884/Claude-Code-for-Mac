import { query, listSessions, deleteSession } from '@anthropic-ai/claude-agent-sdk'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
const cwd = await mkdtemp(join(tmpdir(), 'desk-rewind-'))
const controller = new AbortController()
const timer = setTimeout(()=>controller.abort(),45000)
let wake
const inputs=[]
async function* stream() {
  while (!controller.signal.aborted) {
    if (!inputs.length) await new Promise(r=>{wake=r})
    while(inputs.length) yield inputs.shift()
  }
}
const send=(text,id)=>{inputs.push({type:'user',uuid:id,message:{role:'user',content:text},parent_tool_use_id:null,origin:{kind:'human'}});wake?.()}
const q=query({prompt:stream(),options:{cwd,persistSession:true,enableFileCheckpointing:true,extraArgs:{'replay-user-messages':null},model:'haiku',maxTurns:3,tools:['Write'],canUseTool:async()=>({behavior:'allow'}),abortController:controller,pathToClaudeCodeExecutable:resolve('node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude')}})
const first=randomUUID(),second=randomUUID()
try {
  const init=await q.initializationResult()
  console.log('CLI',init.claude_code_version,'inputs',first,second)
  send('Use Write to create '+join(cwd,'probe.txt')+' with exactly "before\\n". Reply done.',first)
  let turns=0
  for await(const m of q) {
    if(m.type==='user')console.log('checkpoint',m.uuid)
    if(m.type!=='result')continue
    if(m.is_error)throw Error(m.subtype)
    if(++turns===1){send('Use Write to replace '+join(cwd,'probe.txt')+' with exactly "after\\n". Reply done.',second);continue}
    console.log('written',JSON.stringify(await readFile(join(cwd,'probe.txt'),'utf8')))
    const preview=await q.rewindFiles(second,{dryRun:true})
    if(!preview.canRewind)throw Error(preview.error??'checkpoint unavailable')
    const result=await q.rewindFiles(second)
    if(!result.canRewind)throw Error(result.error??'rewind failed')
    const content=await readFile(join(cwd,'probe.txt'),'utf8')
    if(!content.startsWith('before'))throw Error('content not restored')
    console.log('PASS real checkpoint preview and restore')
    break
  }
}finally{clearTimeout(timer);q.close();controller.abort();wake?.();for(const session of await listSessions({dir:cwd})) await deleteSession(session.sessionId,{dir:cwd});await rm(cwd,{recursive:true,force:true})}
