// 合成 SDK 事件端到端验证，不调用模型。可通过 CLAUDE_DESK_SMOKE_ENTRY 检查打包资源。
const { app, ipcMain, nativeTheme } = require('electron')
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { buildSync } = require('esbuild')
const scratch = mkdtempSync(join(tmpdir(), 'claude-thinking-'))
const project = join(scratch, 'project'), userdata = join(scratch, 'userdata')
mkdirSync(project); mkdirSync(userdata)
writeFileSync(join(userdata, 'claude-desk.json'), JSON.stringify({ version: 1, projects: [{ id: 'p', name: '动效验证', path: project, addedAt: 0, collapsed: false }], archived: {}, settings: { theme: 'light', executionLanguage: 'en' }, seededFromHistory: true }))
process.env.CLAUDE_DESK_USERDATA = userdata
buildSync({ entryPoints: [resolve('src/main/transcript.ts'), resolve('src/main/live/TurnActivity.ts')], outdir: join(scratch, 'code'), outbase: resolve('src/main'), outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs' })
const { Transcript } = require(join(scratch, 'code/transcript.cjs'))
const { TurnActivity } = require(join(scratch, 'code/live/TurnActivity.cjs'))
const transcript = new Transcript(project), activity = new TurnActivity()
transcript.addUser('检查当前项目，并说明检查进展。'); activity.start()
const event = (event, parent = null) => ({ type: 'stream_event', event, parent_tool_use_id: parent })
const begin = (id, parent = null) => event({ type: 'message_start', message: { id } }, parent)
const block = (index, type, parent = null) => event({ type: 'content_block_start', index, content_block: { type, thinking: '', text: '' } }, parent)
const delta = (text, index = 0, parent = null) => event({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: text } }, parent)
const apply = (message) => { transcript.apply(message); activity.apply(message); activity.locate(transcript.messages, message) }
apply(begin('main')); apply(block(0, 'thinking')); apply(delta(Array.from({ length: 12 }, (_, i) => `检查步骤 ${i + 1}：核对文件与现有实现。`).join('\n')))
let state = 'running', answerSideQuestion
let queue = { paused: false, items: ['补充检查图片中的标题', '最后整理检查清单'].map((text,i)=>({id:'q'+i,text,status:'queued',options:{model:'Sonnet 5.5',effort:'low',mode:'default'}})) }
const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (name, handler) => {
  const stubs = {
    'sessions:list': () => ['a', 'b'].map(id => ({ id, title: `动效测试 ${id}`, cwd: project, lastModified: 0, archived: false })),
    'chat:open': (_event, id) => ({ messages: id === 'a' ? structuredClone(transcript.messages) : [], activity: id === 'a' ? activity.snapshot() : undefined, state: id === 'a' ? state : 'idle', approvals: [], live: true, ...(id==='a'?{queue:structuredClone(queue),options:{model:'sonnet',effort:'low',mode:'default'},optionsSaved:true}:{}) }),
    'chat:queue': (event,id,cwd,action) => { const item=queue.items.find(i=>i.id===action.id);if(action.type==='beginEdit'&&item)item.editing=true;if(action.type==='cancelEdit'&&item)delete item.editing;if(action.type==='edit'&&item){item.text=action.text;delete item.editing;}if(action.type==='insert'&&item)item.status='submitted';if(action.type==='move'&&item){queue.items=queue.items.filter(i=>i.id!==item.id);const index=queue.items.findIndex(i=>i.id===action.targetId)+(action.position==='after'?1:0);queue.items.splice(index,0,item);}if(action.type==='delete')queue.items=queue.items.filter(i=>i.id!==action.id);event.sender.send('chat:event',id,{kind:'queue',queue:structuredClone(queue)}) },
    'chat:context': () => null, 'chat:checkExternal': () => false,
    'chat:btw': () => new Promise(resolve => { answerSideQuestion = resolve }),
    'usage:overview': () => ({ account: { key: 'fixture', email: 'test@example.com', subscriptionType: 'pro' }, profile: { name: '测试用户', avatar: null }, usage: { available: true, windows: [{ kind: 'five_hour', label: '5 小时内', percent: 20, resetsAt: null }, { kind: 'seven_day', label: '本周（所有模型）', percent: 40, resetsAt: null }] }, updatedAt: Date.now() }),
    'meta:get': () => ({ models: [], subscriptionType: null, claudeVersion: 'fixture' }),
    'meta:usage': () => ({ subscriptionType: null, available: false, windows: [] }), 'meta:commands': (_event, cwd) => ({ cwd, revision: 1, commands: [], status: 'ready', updatedAt: Date.now() })
  }
  originalHandle(name, stubs[name] || handler)
}
const output = resolve('dist/build-check'); mkdirSync(output, { recursive: true })
const timeout = setTimeout(() => { console.error('Thinking smoke timed out'); app.exit(1) }, 60000)
app.on('browser-window-created', (_event, win) => {
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*','https://*/*'] }, (_request, callback) => callback({ cancel: true }))
  win.webContents.once('did-finish-load', async () => {
    const js = code => win.webContents.executeJavaScript(code, true)
    const wait = async condition => { for (let i=0;i<100;i++) { if (await js(condition)) return; await new Promise(r=>setTimeout(r,70)) } throw new Error('Condition failed: '+condition) }
    const click = label => js(`(() => {const element=[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')===${JSON.stringify(label)}||e.innerText===${JSON.stringify(label)})&&e.offsetParent);if(!element)throw new Error('Missing button: '+${JSON.stringify(label)});element.click()})()`)
    const card = text => js(`([...document.querySelectorAll('button')].find(e=>e.offsetParent&&e.innerText.includes(${JSON.stringify(text)}))).click()`)
    const open = async id => { await js(`([...document.querySelectorAll('[role="button"]')].find(e=>e.innerText.includes('动效测试 ${id}'))).click()`); await wait(`document.querySelector('main')?.innerText.includes('动效测试 ${id}')`) }
    const shot = async name => {
      await new Promise(r=>setTimeout(r,200))
      writeFileSync(join(output,name+'.png'),(await win.capturePage()).toPNG())
      if(name==='crab-writing') {
        const rect=await js(`(()=>{const r=document.querySelector('.composer-with-crab').getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()`)
        writeFileSync(join(output,'crab-writing-detail.png'),(await win.capturePage(rect)).toPNG())
      }
    }
    const flush = () => { const messages=transcript.takeChanged(); if(messages.length)win.webContents.send('chat:event','a',{kind:'upsert',messages:structuredClone(messages)}); const value=activity.takeChanged();if(value)win.webContents.send('chat:event','a',{kind:'activity',activity:value}) }
    const send = message => { apply(message); flush() }
    const setState = value => { state=value;win.webContents.send('chat:event','a',{kind:'state',state}) }

    const pose = value => wait(`document.querySelector('[data-crab-pose]')?.dataset.crabPose===${JSON.stringify(value)}`)
    const status = value => wait(`document.querySelector('[data-composer-crab] [role="status"]')?.textContent===${JSON.stringify(value)}`)
    const checkGesture = async () => {
      const result = await js(`(() => {
        const crab = document.querySelector('[data-crab-pose]')
        const gesture = crab.dataset.crabGesture
        const pose = crab.dataset.crabPose
        const expected = gesture === 'thinking' ? 'thinking' : 'working'
        const props = { thinking: '.crab-bulb', cooking: '.crab-prop', making: '.crab-wrench', sorting: '.crab-prop', growing: '.crab-sprout', exploring: '.crab-glass', playing: '.crab-star' }
        return { gesture, pose, expected, prop: !!props[gesture] && !!crab.querySelector(props[gesture]) }
      })()`)
      if (!result.gesture || result.pose !== result.expected || !result.prop) throw Error('Gesture rendering mismatch: ' + JSON.stringify(result))
    }
    const type = async text => {
      win.focus()
      await js(`(()=>{const e=document.querySelector('[data-composer]');e.focus();document.execCommand('selectAll')})()`)
      await new Promise(r=>setTimeout(r,60))
      if(text) await js(`document.execCommand('insertText',false,${JSON.stringify(text)})`)
      else {win.webContents.sendInputEvent({type:'keyDown',keyCode:'Backspace'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Backspace'})}
      await wait(`document.querySelector('[data-composer]').innerText.trim()===${JSON.stringify(text)}`)
    }
    try {
      await wait(`!!document.querySelector('[data-composer-crab]')`)
      await shot('crab-home')
      await type('准备一个新任务'); await pose('look'); await shot('crab-home-draft')
      const crabRect=await js(`(()=>{const r=document.querySelector('.crab').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`)
      win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(crabRect.x+30),y:Math.round(crabRect.y+30)})
      await wait(`getComputedStyle(document.querySelector('.crab-claw-l')).animationName==='crab-greet-claw'`)
      await shot('crab-hover')
      const hoverCheck=await js(`(()=>{const c=document.querySelector('.crab'),r=c.getBoundingClientRect(),bulb=c.querySelector('.crab-bulb'),b=bulb?.getBoundingClientRect(),body=c.querySelector('.crab-body').getBoundingClientRect();return {x:r.x,y:r.y,bulbRight:!b||b.x>body.x+body.width/2,bulbAbove:!b||b.bottom<=body.top,onlyVerb:!document.querySelector('.composer-crab-verb')||document.querySelector('.composer-crab-label').textContent===document.querySelector('.composer-crab-verb').textContent}})()`)
      if(hoverCheck.x!==crabRect.x||hoverCheck.y!==crabRect.y||!hoverCheck.bulbRight||!hoverCheck.bulbAbove||!hoverCheck.onlyVerb)throw Error('Hover position, bulb placement or verb-only label failed: '+JSON.stringify(hoverCheck))
      win.webContents.sendInputEvent({type:'mouseMove',x:10,y:10})
      const aligned = await js(`(()=>{const c=document.querySelector('.crab').getBoundingClientRect(), box=document.querySelector('[data-composer]').parentElement.getBoundingClientRect();return Math.abs(c.bottom-box.top)<2})()`)
      if(!aligned) throw Error('Crab feet are not on the input edge')
      await open('a'); await status('Thinking'); await checkGesture(); await shot('crab-thinking-light')
      const checkQueueSpacing = async () => {
        const overlaps = await js(`(() => {
          const queue = document.querySelector('[aria-label="消息队列"]').getBoundingClientRect()
          const targets = [...document.querySelectorAll('.crab-body, .crab-bulb, .crab-prop, .crab-glass, .crab-star, .composer-crab-label')]
          return targets.filter(element => {
            const rect = element.getBoundingClientRect()
            return rect.width && rect.height && rect.left < queue.right && rect.right > queue.left && rect.top < queue.bottom && rect.bottom > queue.top
          }).map(element => element.getAttribute('class'))
        })()`)
        if (overlaps.length) throw Error('Queue overlaps crab or activity text: ' + overlaps.join(', '))
      }
      await checkQueueSpacing()
      nativeTheme.themeSource='dark'; await new Promise(r=>setTimeout(r,200)); await shot('crab-thinking-dark');nativeTheme.themeSource='light'; await new Promise(r=>setTimeout(r,200))
      await type('下一条排队任务'); await status('Thinking'); await checkGesture()
      send(event({type:'content_block_start',index:1,content_block:{type:'text',text:''}})); await status('Responding'); await checkGesture(); await checkQueueSpacing(); await shot('crab-writing')
      send({type:'assistant',uuid:'tool-final',message:{id:'tool-message',content:[{type:'tool_use',id:'write',name:'Write',input:{file_path:join(project,'README.md'),content:'example'}}]}})
      await wait(`document.querySelector('[data-composer-crab] [role="status"]')?.textContent==='Writing'`)
      await click('编辑'); await wait(`document.body.innerText.includes('正在编辑排队消息')`); await status('Writing'); await checkGesture(); await shot('crab-queue-edit'); await click('取消编辑')
      setState('awaiting'); await pose('waiting'); await shot('crab-waiting')
      setState('running');activity.stop();flush(); await wait(`document.querySelector('.composer-crab-state')?.textContent==='Stopping…'`)
      setState('error');await pose('error');await shot('crab-error')
      activity.finish();flush();setState('idle'); await pose('look')
      await open('b');await pose('idle');await open('a');await pose('look')
      activity.start();flush();setState('running');send({type:'tool_progress',tool_use_id:'bash',tool_name:'Bash'});await status('Running command');await checkGesture();win.setMinimumSize(500,600);win.setSize(600,720);await new Promise(r=>setTimeout(r,200));await checkQueueSpacing();await shot('crab-narrow')
      const fits=await js(`(()=>{const r=document.querySelector('[data-composer-crab]').getBoundingClientRect();return r.right<=innerWidth})()`)
      if(!fits)throw Error('Crab overflows narrow window')
      win.setSize(1100,820);activity.finish();flush();setState('idle')
      await type('/');await wait(`!!document.querySelector('[role="listbox"]')`);await shot('crab-suggestions')
      await type('/model');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});await wait(`!!document.querySelector('[role="dialog"]')`);await shot('crab-command-panel');await click('关闭（Esc）');await type('');
      win.webContents.debugger.attach('1.3')
      const attachmentPath=join(project,'note.txt');writeFileSync(attachmentPath,'attachment fixture')
      const doc=await win.webContents.debugger.sendCommand('DOM.getDocument')
      const input=await win.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'})
      await win.webContents.debugger.sendCommand('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[attachmentPath]})
      await wait(`!!document.querySelector('[aria-label="已添加文件"]')`);await pose('look');await shot('crab-attachment')
      await click('移除 note.txt')

      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
      const reduced=await js(`getComputedStyle(document.querySelector('.crab-body')).animationName==='none'`)
      if(!reduced)throw Error('Reduced motion is not respected')
      await pose('idle'); await new Promise(r=>setTimeout(r,30100));await pose('sleep');await shot('crab-sleep')
      console.log('PASS: crab home/draft/thinking/writing/tool/queue-edit/awaiting/stop/error/completion/session-switch/narrow/suggestions/command-panel/attachment/reduced-motion/sleep; stationary hover, upper-right bulb, verb-only label, edge alignment and queue spacing')
      clearTimeout(timeout);app.quit()
    } catch(error){console.error(error);await shot('crab-failure');clearTimeout(timeout);app.exit(1)}
  })
})
require(process.env.CLAUDE_DESK_SMOKE_ENTRY || '../out/main/index.js')
