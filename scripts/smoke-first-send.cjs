// Synthetic first-send transitions only; no model calls or real session data.
const { app, ipcMain, nativeTheme } = require('electron')
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { buildSync } = require('esbuild')
const scratch = mkdtempSync(join(tmpdir(), 'claude-first-send-'))
const project = join(scratch, 'project'), userdata = join(scratch, 'userdata')
mkdirSync(project); mkdirSync(userdata)
writeFileSync(join(userdata, 'claude-desk.json'), JSON.stringify({ version: 1, projects: [{ id: 'p', name: '首次发送动画', path: project, addedAt: 0, collapsed: false }], archived: {}, settings: { theme: 'light' }, seededFromHistory: true }))
process.env.CLAUDE_DESK_USERDATA = userdata
buildSync({ entryPoints: [resolve('src/main/transcript.ts')], outfile: join(scratch,'transcript.cjs'), bundle: true, platform: 'node', format: 'cjs' })
const { Transcript } = require(join(scratch,'transcript.cjs'))
let fail = false, counter = 0, eventDelay = 30
const sessions = new Map()
const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (name, handler) => {
  const stubs = {
    'sessions:list': () => [...sessions.keys()].map(id => ({ id, title: '动画测试 '+id, cwd: project, lastModified: 0, archived: false })),
    'chat:start': async (event, cwd, prompt) => {
      if (fail) throw Error('模拟发送失败')
      const id = 'flight-'+(++counter), transcript = new Transcript(project)
      transcript.addUser(prompt); sessions.set(id, transcript)
      setTimeout(() => {
        event.sender.send('chat:event', id, {kind:'upsert',messages:structuredClone(transcript.messages)})
        event.sender.send('chat:event', id, {kind:'state',state:'running'})
        event.sender.send('chat:event', id, {kind:'activity',activity:{revision:counter,phase:'thinking'}})
      }, eventDelay)
      return id
    },
    'chat:open': (_event, id) => ({messages:structuredClone(sessions.get(id)?.messages ?? []),state:'running',approvals:[],live:true}),
    'chat:context': () => null, 'chat:checkExternal': () => false,
    'usage:overview': () => ({ account:{key:'fixture',email:null,organization:null,subscriptionType:null},profile:{name:'测试',avatar:null},usage:{available:false,windows:[]},updatedAt:Date.now() }),
    'meta:get': () => ({models:[],subscriptionType:null,claudeVersion:'fixture'}),
    'meta:usage': () => ({subscriptionType:null,available:false,windows:[]}),
    'meta:commands': (_event,cwd) => ({cwd,revision:1,commands:[],status:'ready',updatedAt:Date.now()})
  }
  originalHandle(name, stubs[name] || handler)
}
const output=resolve('dist/build-check');mkdirSync(output,{recursive:true})
const timeout=setTimeout(()=>{console.error('First send timed out');app.exit(1)},60000)
app.on('browser-window-created',(_event,win)=>{
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_request,callback)=>callback({cancel:true}))
  win.webContents.once('did-finish-load',async()=>{
    const js=code=>win.webContents.executeJavaScript(code,true)
    const wait=async condition=>{for(let i=0;i<150;i++){if(await js(condition))return;await new Promise(r=>setTimeout(r,15))}throw Error('Condition failed: '+condition)}
    const click=label=>js(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&(e.getAttribute('aria-label')===${JSON.stringify(label)}||e.innerText===${JSON.stringify(label)}));if(!e)throw Error('Missing '+${JSON.stringify(label)});e.click()})()`)
    const type=async text=>{win.focus();await js(`(()=>{const e=document.querySelector('[data-composer]');e.focus();document.execCommand('selectAll');document.execCommand('insertText',false,${JSON.stringify(text)})})()`);await wait(`document.querySelector('[data-composer]').innerText.replace(/\\s/g,'')===${JSON.stringify(text.replace(/\s/g,''))}`)}
    const shot=async name=>writeFileSync(join(output,name+'.png'),(await win.capturePage()).toPNG())
    const done=()=>wait(`!document.querySelector('.first-send-overlay')&&!document.querySelector('[data-first-send-target]')`)
    try {
      await wait(`!!document.querySelector('[data-composer]')`)
      await type('把一个想法，变成新的开始。')
      await js(`Math.random=()=>0;void 0`)
      const sourceY=await js(`document.querySelector('.crab').getBoundingClientRect().y`)
      await shot('first-send-before');await click('发送')
      await wait(`!!document.querySelector('.first-send-carrier')`)
      await js(`window.flightAnimations=document.getAnimations().filter(a=>a.effect?.target.closest('.first-send-overlay')||a.effect?.target.matches('[data-composer-surface]'));window.flightAnimations.forEach(a=>a.pause())`)
      const centers=[]
      if(await js(`document.querySelector('.first-send-carrier').dataset.flightVariant!=='hop'`))throw Error('Expected hop variant')
      for(const [time,name] of [[180,'first-send-launch'],[420,'first-send-mid'],[760,'first-send-landing']]){
        await js(`window.flightAnimations.forEach(a=>a.currentTime=${time});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
        centers.push(await js(`(()=>{const r=document.querySelector('main [data-composer-surface]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`))
        if(time===180&&await js(`document.querySelector('.first-send-carrier').getBoundingClientRect().y>=${sourceY}`))throw Error('Hop does not rise before falling')
        if(time===420){
          const wraps=await js(`(()=>{const source=document.querySelector('main [data-user-bubble]'),copy=document.querySelector('.first-send-shell [data-user-bubble]');return copy.scrollHeight>source.scrollHeight+1})()`)
          if(wraps)throw Error('Morph snapshot changes message wrapping')
        }
        await shot(name)
      }
      if(centers.some(c=>Math.abs(c.x-centers[0].x)>.5||Math.abs(c.y-centers[0].y)>.5))throw Error('Composer center moved during reveal')
      await js(`window.flightAnimations.forEach(a=>a.play())`)
      await done()
      await wait(`getComputedStyle(document.querySelector('[data-user-bubble]')).visibility==='visible'&&getComputedStyle(document.querySelector('[data-composer-surface]')).opacity==='1'`)
      if(await js(`document.querySelectorAll('[data-user-bubble]').length!==1`))throw Error('Duplicate first message')
      await shot('first-send-after')
      for(const [variant,random] of [['spin',0],['flip',.999]]) {
        await click('新对话');await type('验证 '+variant)
        if(variant==='flip'){nativeTheme.themeSource='dark';await new Promise(r=>setTimeout(r,150))}
        await js(`Math.random=()=>${random};void 0`);await click('发送');await wait(`!!document.querySelector('.first-send-carrier')`)
        if(await js(`document.querySelector('.first-send-carrier').dataset.flightVariant!==${JSON.stringify(variant)}`))throw Error('Incorrect variation '+variant)
        await js(`window.flightAnimations=document.getAnimations().filter(a=>a.effect?.target.closest('.first-send-overlay')||a.effect?.target.matches('[data-composer-surface]'));window.flightAnimations.forEach(a=>{a.pause();a.currentTime=360});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
        const proof=await js(`({rotation:getComputedStyle(document.querySelector('.first-send-rotor')).transform,stroke:getComputedStyle(document.querySelector('.first-send-trails')).stroke})`)
        if(variant==='spin'&&proof.stroke!=='rgb(0, 0, 0)')throw Error('Light trails must be black')
        if(variant==='flip'&&(!proof.rotation.startsWith('matrix3d')||proof.stroke!=='rgb(199, 199, 199)'))throw Error('Flip axis or dark trail color incorrect: '+JSON.stringify(proof))
        await shot('first-send-'+variant)
        await js(`window.flightAnimations.forEach(a=>a.play())`);await done()
      }
      nativeTheme.themeSource='light'
      // Abandon mid-flight: no overlay or hidden elements may leak into the new page.
      await click('新对话');await type('中途切换');await click('发送');await wait(`!!document.querySelector('.first-send-carrier')`);await click('新对话');await done()
      // Failure keeps the editable draft and never flies to a nonexistent session.
      fail=true;await type('失败后保留草稿');await click('发送');await wait(`document.body.innerText.includes('模拟发送失败')`);await done()
      if(await js(`document.querySelector('[data-composer]').innerText.trim()!=='失败后保留草稿'`))throw Error('Draft lost on failure')
      fail=false
      // System reduced motion bypasses the whole sequence.
      win.webContents.debugger.attach('1.3')
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
      await click('发送');await wait(`!!document.querySelector('[data-user-bubble]')`);await done()
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]})
      // Long, multiline text and a narrow viewport retain usable final layout.
      nativeTheme.themeSource='dark';win.setMinimumSize(600,600);win.setSize(720,780)
      await click('新对话');await type('这是较长的首条消息。'.repeat(18)+'\n第二行保留换行。');await click('发送');await wait(`!!document.querySelector('[data-user-bubble]')`);await done();await shot('first-send-long-dark')
      // A late user event must not leave the new input hidden.
      eventDelay=900;await click('新对话');await type('延迟到达的消息');await click('发送');await wait(`!!document.querySelector('[data-user-bubble]')`);await done()
      console.log('PASS: stationary center-scale composer; hop/spin/horizontal-axis flip variants; black/light-gray trails; three-part first-send handoff; measured landing; single message; navigation cancellation; failed send draft; reduced motion; long text/dark/narrow; delayed event fallback')
      clearTimeout(timeout);app.quit()
    } catch(error){console.error(error);await shot('first-send-failure');clearTimeout(timeout);app.exit(1)}
  })
})
require(process.env.CLAUDE_DESK_SMOKE_ENTRY || '../out/main/index.js')
