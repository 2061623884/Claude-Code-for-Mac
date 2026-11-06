// Isolated native /config check, no model requests.
import { query } from '@anthropic-ai/claude-agent-sdk'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
const root=await mkdtemp(join(tmpdir(),'desk-language-'));const config=join(root,'config');await mkdir(config)
try {
 for(const value of [null,'简体中文','繁體中文','English','default']){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000)
  const q=query({prompt:value===null?'/config':`/config language=${value}`,options:{cwd:root,persistSession:false,env:{...process.env,CLAUDE_CONFIG_DIR:config},pathToClaudeCodeExecutable:resolve('node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude'),abortController:controller}})
  try{let text='';for await(const m of q){if(m.type==='assistant'){assert.equal(m.message.model,'<synthetic>');text+=m.message.content.filter(c=>c.type==='text').map(c=>c.text).join('')}if(m.type==='result')break}
   console.log(value===null?text.split('\n').filter(l=>/language/i.test(l)).join('\n'):text.trim())
   if(value!==null){assert.match(text,/^Set /);const settings=JSON.parse(await readFile(join(config,'settings.json'),'utf8'));console.log('saved language',settings.language??'(unset)');assert.equal(settings.language,value==='default'?undefined:value)}
  }finally{clearTimeout(timer);q.close();controller.abort()}
 }
}finally{await rm(root,{recursive:true,force:true})}
