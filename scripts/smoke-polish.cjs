// Electron 内运行。合成命令加载延迟，不请求模型；真实验证窗口、PTY 和内嵌浏览器。
const { app, BrowserWindow, ipcMain, Menu } = require('electron')
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { createServer } = require('node:http')
const { buildSync } = require('esbuild')
const scratch=mkdtempSync(join(tmpdir(),'claude-polish-')), project=join(scratch,'project'), userdata=join(scratch,'userdata')
mkdirSync(project);mkdirSync(userdata)
writeFileSync(join(userdata,'claude-desk.json'),JSON.stringify({version:1,projects:[{id:'p',path:project,name:'交互验证',addedAt:0,collapsed:false}],archived:{},settings:{theme:'light'},seededFromHistory:true}))
process.env.CLAUDE_DESK_USERDATA=userdata
buildSync({entryPoints:[resolve('src/main/commandCatalog.ts')],outfile:join(scratch,'catalog.cjs'),bundle:true,platform:'node',format:'cjs'})
const {CommandCatalog}=require(join(scratch,'catalog.cjs'))
let loads=0, ipcCalls=0, initializationComplete=false
const catalog=new CommandCatalog({directory:()=>join(userdata,'test-catalog'),configuration:()=> 'synthetic',load:async()=>{loads++;await new Promise(r=>setTimeout(r,3000));initializationComplete=true;return ['init','clear','compact','project-skill'].map(name=>({name,description:name,argumentHint:''}))},publish:snapshot=>{for(const win of BrowserWindow.getAllWindows())win.webContents.send('meta:commands',snapshot)}})
const originalHandle=ipcMain.handle.bind(ipcMain)
ipcMain.handle=(name,handler)=>{
 const stubs={
  'sessions:list':()=>[{id:'session',title:'窗口状态保留测试',cwd:project,lastModified:0,archived:false}],
  'chat:open':()=>({messages:[],state:'idle',approvals:[],live:false}),
  'chat:context':()=>null,'chat:checkExternal':()=>false,
  'meta:get':()=>({models:[],subscriptionType:null,claudeVersion:'fixture'}),
  'meta:usage':()=>({subscriptionType:null,available:false,windows:[]}),
  'meta:commands':(_event,cwd,force)=>{ipcCalls++;return catalog.get(cwd,force)}
 }
 originalHandle(name,stubs[name]||handler)
}
const output=resolve('dist/build-check');mkdirSync(output,{recursive:true})
const server=createServer((_request,response)=>response.end('<title>Retained browser</title><h1>Retained browser</h1>'));server.listen(0,'127.0.0.1')
const timeout=setTimeout(()=>{console.error('Polish smoke timed out');app.exit(1)},60000)
let proof={passed:false}, quitting=false
app.on('before-quit',()=>{quitting=true;catalog.close();server.close()})
app.on('will-quit',()=>{clearTimeout(timeout);proof.quitObserved=true;if(process.env.CLAUDE_POLISH_PROOF)writeFileSync(process.env.CLAUDE_POLISH_PROOF,JSON.stringify(proof))})
app.on('browser-window-created',(_event,win)=>{
 win.webContents.on('console-message',event=>{if(event.level==='error')console.error('[renderer]',event.message)})
 win.webContents.once('did-finish-load',async()=>{
  const js=async code=>{try{return await win.webContents.executeJavaScript(code,true)}catch(error){throw new Error('Renderer script failed: '+code+'\n'+error)}}
  const wait=async condition=>{for(let i=0;i<120;i++){if(await js(condition))return;await new Promise(r=>setTimeout(r,60))}throw new Error('Condition failed: '+condition)}
  const click=label=>js(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}&&e.offsetParent);if(!b)throw new Error('Missing button: '+${JSON.stringify(label)});b.click()})()`)
  const card=text=>js(`([...document.querySelectorAll('button')].find(e=>e.offsetParent&&e.innerText.includes(${JSON.stringify(text)}))).click()`)
  const shot=async name=>writeFileSync(join(output,name+'.png'),(await win.capturePage()).toPNG())
  const key=keyCode=>{win.webContents.sendInputEvent({type:'keyDown',keyCode});win.webContents.sendInputEvent({type:'keyUp',keyCode})}
  try{
   await wait(`!!document.querySelector('[role="textbox"]')`)
   await js(`document.querySelector('[role="textbox"]').focus();window.__initLatency=null;window.__slashStart=performance.now();window.__slashObserver=new MutationObserver(()=>{if([...document.querySelectorAll('[role="option"]')].some(e=>e.innerText.startsWith('/init'))){window.__initLatency=performance.now()-window.__slashStart;window.__slashObserver.disconnect()}});window.__slashObserver.observe(document.body,{childList:true,subtree:true});true`)
   win.webContents.sendInputEvent({type:'char',keyCode:'/'})
   await wait(`window.__initLatency!==null`)
   const latency=await js('window.__initLatency');console.log('Cold /init latency:',latency)
   if(latency>100)throw new Error('Cold init suggestion exceeded 100ms: '+latency)
   if(initializationComplete)throw new Error('Menu waited for the SDK')
   const before=ipcCalls
   win.webContents.sendInputEvent({type:'char',keyCode:'i'});win.webContents.sendInputEvent({type:'char',keyCode:'n'})
   await wait(`document.querySelector('[role="textbox"]').innerText==='/in' && [...document.querySelectorAll('[role="option"]')].some(e=>e.innerText.startsWith('/init'))`)
   if(ipcCalls!==before)throw new Error('Keystroke filtering made another IPC request')
   key('Tab');await wait(`document.querySelector('[role="textbox"]').innerText.trim()==='/init'`)
   if(loads!==1)throw new Error('Concurrent command loads were not coalesced')
   await shot('slash-instant')
   // 等后台完成后，自定义命令应进入同一目录。
   await new Promise(r=>setTimeout(r,3200))
   await js(`([...document.querySelectorAll('[role="button"]')].find(e=>e.innerText.includes('窗口状态保留测试'))).click()`)
   await wait(`!!document.querySelector('[data-page-count]')`)
   await js(`document.querySelector('main [role="textbox"]').focus()`)
   await win.webContents.insertText('保留的草稿')
   await wait(`document.querySelector('main [role="textbox"]').innerText.includes('保留的草稿')`)
   await click('展开右栏（⌘⇧B）');await card('新建终端')
   await js(`window.__terminalData='';window.desk.terminal.onData((id,data)=>{window.__terminalId=id;window.__terminalData+=data});true`)
   await wait(`!!document.querySelector('.xterm-helper-textarea')`)
   win.webContents.sendInputEvent({type:'char',keyCode:'\r'})
   await wait(`!!window.__terminalId`)
   await js(`window.__terminalData='';window.desk.terminal.write(window.__terminalId,${JSON.stringify('printf "\\nSHELL_ID:%s\\n" "$$"\r')})`)
   await wait(`/SHELL_ID:([0-9]+)/.test(window.__terminalData)`)
   const pid=Number(await js(`window.__terminalData.match(/SHELL_ID:([0-9]+)/)[1]`))
   proof={passed:false,pid,latency}
   if(process.env.CLAUDE_POLISH_PROOF)writeFileSync(process.env.CLAUDE_POLISH_PROOF,JSON.stringify(proof))
   await click('新建侧栏页面');await card('浏览器')
   const url=`http://127.0.0.1:${server.address().port}/`
   await wait(`!!document.querySelector('input[aria-label="网址"]')`)
   await js(`(()=>{const input=document.querySelector('input[aria-label="网址"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(url)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
   await new Promise(r=>setTimeout(r,70));await js(`document.querySelector('input[aria-label="网址"]').closest('form').requestSubmit()`)
   await new Promise(r=>setTimeout(r,300))
   const guest=win.contentView.children.find(child=>child.webContents&&child.webContents!==win.webContents)
   if(!guest)throw new Error('Browser missing')
   await guest.webContents.executeJavaScript('window.retainedCounter=42')
   const renderer=win.webContents.id, count=await js(`document.querySelector('[data-page-count]').dataset.pageCount`)
   // 原生红色关闭按钮走 BrowserWindow.close 的同一事件链。
   win.close();await new Promise(r=>setTimeout(r,180))
   if(win.isDestroyed()||win.isVisible()||quitting)throw new Error('Close quit or destroyed the window')
   process.kill(pid,0)
   app.emit('activate',{},false);await new Promise(r=>setTimeout(r,180))
   if(!win.isVisible()||win.webContents.id!==renderer)throw new Error('Dock activation did not restore the same renderer')
   await wait(`document.querySelector('main [role="textbox"]').innerText.includes('保留的草稿')`)
   if(await js(`document.querySelector('[data-page-count]').dataset.pageCount`)!==count)throw new Error('Sidebar tabs changed after reopen')
   if(await guest.webContents.executeJavaScript('window.retainedCounter')!==42)throw new Error('Browser state lost')
   const menu=Menu.getApplicationMenu(), close=menu.getMenuItemById('close-window'), quit=menu.getMenuItemById('quit-app')
   if(close.accelerator!=='CommandOrControl+W'||quit.accelerator!=='Command+Q')throw new Error('Incorrect native keyboard bindings')
   close.click();await new Promise(r=>setTimeout(r,100));if(win.isVisible()||win.isDestroyed())throw new Error('Command-W action did not hide window')
   app.emit('second-instance',{},[],scratch);await new Promise(r=>setTimeout(r,120))
   if(BrowserWindow.getAllWindows().length!==1||!win.isVisible())throw new Error('Second instance created or failed to restore window')
   process.kill(pid,0);await shot('window-restored')
   proof.passed=true;proof.loads=loads
   console.log(`PASS: /init visible in ${latency.toFixed(1)}ms during 3s SDK delay; local filtering; close/Dock/Command-W retain renderer, drafts, PTY and browser`)
   quit.click()
  }catch(error){console.error(error);await shot('polish-failure');clearTimeout(timeout);catalog.close();server.close();app.exit(1)}
 })
})
require(process.env.CLAUDE_DESK_SMOKE_ENTRY||'../out/main/index.js')
