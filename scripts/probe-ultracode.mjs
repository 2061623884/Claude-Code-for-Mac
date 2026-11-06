import {query} from '@anthropic-ai/claude-agent-sdk';
const ac=new AbortController(), timer=setTimeout(()=>ac.abort(),30000);
const q=query({prompt:(async function*(){await new Promise(r=>ac.signal.addEventListener('abort',r,{once:true}));})(),options:{cwd:'/tmp',persistSession:false,abortController:ac,settings:{enableWorkflows:true},pathToClaudeCodeExecutable:process.cwd()+'/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude'}});
try{
 const init=await q.initializationResult();console.log('CLI',init.claude_code_version);
 for(const [name,patch] of [['auto',{effortLevel:null}],['on',{ultracode:true}],['high',{effortLevel:'high',ultracode:true}],['auto-preserve',{effortLevel:null,ultracode:true}],['off',{ultracode:false}],['on-again',{ultracode:true}],['off-again',{ultracode:false}]]){
  await q.applyFlagSettings(patch);
  const r=await q.request({subtype:'get_settings'}); const a=r.response?.applied;
  if(a?.ultracode !== (patch.ultracode ?? false)) throw new Error(name + ': unexpected Ultracode state');
  if(patch.effortLevel === 'high' && a.effort !== 'high') throw new Error('effort not applied');
  console.log(name,JSON.stringify(a));
 }
}catch(e){console.error(e.message);process.exitCode=1}finally{clearTimeout(timer);q.close();ac.abort()}
