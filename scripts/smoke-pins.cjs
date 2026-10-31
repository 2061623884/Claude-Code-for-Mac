// 临时用户数据和合成事件，不启动 SDK 查询。
const { app, ipcMain } = require('electron')
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const scratch = mkdtempSync(join(tmpdir(), 'claude-pins-'))
const project = join(scratch, 'project'), userdata = join(scratch, 'userdata')
mkdirSync(project); mkdirSync(userdata)
writeFileSync(join(userdata, 'claude-desk.json'), JSON.stringify({version:1, projects:[{id:'p',name:'测试项目',path:project,addedAt:0,collapsed:false}],archived:{},settings:{theme:'light'},seededFromHistory:true}))
process.env.CLAUDE_DESK_USERDATA = userdata
const handle = ipcMain.handle.bind(ipcMain)
let releaseOpen
ipcMain.handle = (name, handler) => handle(name, ({
  'sessions:list': () => ['a','b'].map(id=>({id,title:`会话 ${id}`,cwd:project,lastModified:Date.now(),archived:false})),
  'chat:open': (_e,id) => id === 'b' ? new Promise(resolve=>{releaseOpen=()=>resolve({messages:[],state:'idle',approvals:[],live:false})}) : ({messages:[],state:'idle',approvals:[],live:false}),
  'chat:context':()=>null, 'chat:checkExternal':()=>false,
  'meta:get':()=>({models:[],subscriptionType:null,claudeVersion:'fixture'}),
  'meta:usage':()=>({available:false,windows:[]}),
  'meta:commands':(_e,cwd)=>({cwd,revision:1,commands:[],status:'ready',updatedAt:Date.now()})
})[name] || handler)
const timeout=setTimeout(()=>{console.error('Timed out');app.exit(1)},45000)
app.on('browser-window-created',(_e,win)=>{
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_r,cb)=>cb({cancel:true}))
  win.webContents.once('did-finish-load',async()=>{
    const js=code=>win.webContents.executeJavaScript(code,true)
    const wait=async code=>{for(let i=0;i<100;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,50))}throw Error(code)}
    const row=id=>`[...document.querySelectorAll('[role="button"]')].find(e=>e.title==='会话 ${id}')`
    try{
      win.show();win.focus()
      await wait(`${row('b')} !== undefined`)
      await js(`${row('b')}.querySelector('[aria-label="置顶"]').click()`)
      await wait(`document.querySelector('[aria-label="取消置顶"]') !== null`)
      if(await js(`document.querySelectorAll('[title="会话 b"]').length`)!==1)throw Error('Duplicate pinned row')
      await js(`${row('b')}.querySelector('[aria-label="取消置顶"]').click()`)
      await wait(`!document.querySelector('[aria-label="取消置顶"]')`)
      await js(`${row('b')}.querySelector('[aria-label="置顶"]').click()`)
      await js(`${row('a')}.click()`)
      await wait(`document.querySelector('main')?.textContent.includes('会话 a')`)
      const result={kind:'result',resultId:'r1',durationMs:10,error:null}
      win.webContents.send('chat:event','b',result)
      await wait(`!!${row('b')}.querySelector('[aria-label="有未读回复"]')`)
      // 未加载完成不能清除；加载完成并实际打开后清除。
      await js(`${row('b')}.click()`)
      await new Promise(r=>setTimeout(r,150))
      if(!await js(`!!${row('b')}.querySelector('[aria-label="有未读回复"]')`))throw Error('Read before loading')
      releaseOpen()
      await wait(`!${row('b')}.querySelector('[aria-label="有未读回复"]')`)
      win.webContents.send('chat:event','b',result)
      await new Promise(r=>setTimeout(r,100))
      if(await js(`!!${row('b')}.querySelector('[aria-label="有未读回复"]')`))throw Error('Duplicate completion')
      win.hide()
      win.webContents.send('chat:event','b',{...result,resultId:'r2'})
      await wait(`!!${row('b')}.querySelector('[aria-label="有未读回复"]')`)
      win.show();win.focus()
      await wait(`!${row('b')}.querySelector('[aria-label="有未读回复"]')`)
      await js(`${row('a')}.click()`)
      win.webContents.send('chat:event','b',{...result,resultId:'r3'})
      await wait(`!!${row('b')}.querySelector('[aria-label="有未读回复"]')`)
      const output=resolve('dist/build-check');mkdirSync(output,{recursive:true})
      writeFileSync(join(output,'pins-unread.png'),(await win.capturePage()).toPNG())
      console.log('PASS: direct pin/unpin, no duplicate, deferred read, completion dedup, hidden window unread/focus read')
      clearTimeout(timeout);app.quit()
    }catch(error){console.error(error);clearTimeout(timeout);app.exit(1)}
  })
})
require(process.env.CLAUDE_DESK_SMOKE_ENTRY || '../out/main/index.js')
