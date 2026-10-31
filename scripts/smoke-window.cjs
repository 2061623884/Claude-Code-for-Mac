// Node 父进程检查菜单退出后 Electron 与 PTY 均已退出。
const { spawn }=require('node:child_process')
const { mkdtempSync, readFileSync }=require('node:fs')
const { tmpdir }=require('node:os')
const { join }=require('node:path')
const proofPath=join(mkdtempSync(join(tmpdir(),'claude-window-proof-')),'proof.json')
const env={...process.env,CLAUDE_POLISH_PROOF:proofPath};delete env.ELECTRON_RUN_AS_NODE
const child=spawn(require('electron'),[join(__dirname,'smoke-polish.cjs')],{env,stdio:'inherit'})
child.on('error',error=>{console.error(error);process.exitCode=1})
child.on('exit',async(code)=>{
 if(code!==0){process.exitCode=code||1;return}
 try{
  const proof=JSON.parse(readFileSync(proofPath,'utf8'))
  if(!proof.passed||!proof.quitObserved||!proof.pid)throw new Error('Missing exit proof')
  for(let i=0;i<30;i++){
   let alive=true;try{process.kill(proof.pid,0)}catch{alive=false}
   if(!alive){console.log('PASS: Command-Q menu action exited Electron and released PTY '+proof.pid);return}
   await new Promise(r=>setTimeout(r,100))
  }
  throw new Error('PTY survived application quit')
 }catch(error){console.error(error);process.exitCode=1}
})
