// 合成 SDK 事件端到端验证，不调用模型。可通过 CLAUDE_DESK_SMOKE_ENTRY 检查打包资源。
const { app, ipcMain, nativeTheme } = require('electron')
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { buildSync } = require('esbuild')
const scratch = mkdtempSync(join(tmpdir(), 'claude-thinking-'))
const project = join(scratch, 'project'), userdata = join(scratch, 'userdata')
mkdirSync(project); mkdirSync(userdata)
writeFileSync(join(userdata, 'claude-desk.json'), JSON.stringify({ version: 1, projects: [{ id: 'p', name: '动效验证', path: project, addedAt: 0, collapsed: false }], archived: {}, settings: { theme: 'light' }, seededFromHistory: true }))
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
const apply = (message) => { transcript.apply(message); activity.apply(message) }
apply(begin('main')); apply(block(0, 'thinking')); apply(delta(Array.from({ length: 12 }, (_, i) => `检查步骤 ${i + 1}：核对文件与现有实现。`).join('\n')))
let state = 'running', answerSideQuestion
const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (name, handler) => {
  const stubs = {
    'sessions:list': () => ['a', 'b'].map(id => ({ id, title: `动效测试 ${id}`, cwd: project, lastModified: 0, archived: false })),
    'chat:open': (_event, id) => ({ messages: id === 'a' ? structuredClone(transcript.messages) : [], activity: id === 'a' ? activity.snapshot() : undefined, state: id === 'a' ? state : 'idle', approvals: [], live: true }),
    'chat:context': () => null, 'chat:checkExternal': () => false,
    'chat:btw': () => new Promise(resolve => { answerSideQuestion = resolve }),
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
    const click = label => js(`(() => {const element=[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}&&e.offsetParent);if(!element)throw new Error('Missing button: '+${JSON.stringify(label)});element.click()})()`)
    const card = text => js(`([...document.querySelectorAll('button')].find(e=>e.offsetParent&&e.innerText.includes(${JSON.stringify(text)}))).click()`)
    const open = async id => { await js(`([...document.querySelectorAll('[role="button"]')].find(e=>e.innerText.includes('动效测试 ${id}'))).click()`); await wait(`document.querySelector('main')?.innerText.includes('动效测试 ${id}')`) }
    const shot = async name => writeFileSync(join(output,name+'.png'),(await win.capturePage()).toPNG())
    const flush = () => { const messages=transcript.takeChanged(); if(messages.length)win.webContents.send('chat:event','a',{kind:'upsert',messages:structuredClone(messages)}); const value=activity.takeChanged();if(value)win.webContents.send('chat:event','a',{kind:'activity',activity:value}) }
    const send = message => { apply(message); flush() }
    const setState = value => { state=value;win.webContents.send('chat:event','a',{kind:'state',state}) }
    const checkSummaryOrder = async () => {
      const correct = await js(`(()=>{
        const summary=document.querySelector('[data-thinking-summary]');
        const answer=[...document.querySelectorAll('main p')].find(e=>e.textContent==='检查完成。');
        return Boolean(summary && answer && (summary.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING));
      })()`)
      if(!correct)throw new Error('Thinking summary must precede the answer')
    }
    try {
      await wait(`document.body.innerText.includes('动效测试 a')`); await open('a')
      await wait(`document.querySelector('[data-activity-spark]')?.dataset.animated==='true'`)
      await wait(`document.querySelector('[aria-label="思考摘要内容"]')?.scrollTop>0`)
      const dimensions = await js(`(()=>{const b=document.querySelector('[aria-label="思考摘要内容"]');return {height:b.clientHeight,end:b.scrollHeight-b.scrollTop-b.clientHeight}})()`)
      if(dimensions.height>64||dimensions.end>2) throw new Error('Summary is not showing the latest three lines')
      // Check actual rendered pixels, rather than a path bounding box that could
      // pass even when an SVG mask/filter produces an invisible indicator.
      const sparkRect = await js(`(()=>{const r=document.querySelector('[data-activity-spark]').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:20,height:20}})()`)
      const frames = []
      for(let i=0;i<9;i++) {
        await js(`(()=>{const s=document.querySelector('[data-activity-spark]');s.pauseAnimations();s.setCurrentTime(${i * .09 + .045})})()`)
        await new Promise(r=>setTimeout(r,35))
        frames.push((await win.capturePage(sparkRect)).toPNG().toString('base64'))
      }
      // Frames 4 and 5 are identical in the reference: preserve its expanded hold.
      if(new Set(frames).size!==8 || frames[3]!==frames[4])throw new Error('Reference Spark frame sequence is incorrect: '+new Set(frames).size+' distinct frames')
      await js(`document.querySelector('[data-activity-spark]').unpauseAnimations()`)
      const frameUrls = Array.from({length:9}, (_, i) => 'data:image/png;base64,'+readFileSync(resolve('src/renderer/assets/spark', `frame-${String(i+1).padStart(2,'0')}.png`)).toString('base64'))
      const proofSvg = await js(`(()=>{const s=document.querySelector('[data-activity-spark]').cloneNode(true);s.setAttribute('width','120');s.setAttribute('height','120');s.setAttribute('style','color:rgb(217,118,86)');s.querySelectorAll('image').forEach((img,i)=>img.setAttribute('href',${JSON.stringify(frameUrls)}[i]));return s.outerHTML})()`)
      const referenceUrl='data:image/gif;base64,'+readFileSync(resolve('src/renderer/assets/spark/reference.gif')).toString('base64')
      const darkSvg=proofSvg.replaceAll('spark-mask-','dark-mask-').replaceAll('spark-alpha-','dark-alpha-')
      writeFileSync(join(output,'spark-reference-comparison.html'), `<!doctype html><meta charset="utf-8"><title>Spark 原素材核对</title><style>body{font:16px system-ui;margin:40px}main{display:flex;gap:24px}section{padding:24px;border:1px solid #ddd;border-radius:12px;min-width:180px}.dark{background:#202020;color:white}p{max-width:700px;line-height:1.7}</style><h1>Spark 原素材核对</h1><p>左侧是提供的原 GIF，中间和右侧是应用的 SVG 遮罩。均使用原来的九帧及 0.81 秒周期。此处放大至 120px，应用中为 20px。不是重新设计的矢量路径。</p><main><section><h2>原 GIF</h2><img width="120" height="120" src="${referenceUrl}"></section><section><h2>应用 · 浅色</h2>${proofSvg}</section><section class="dark"><h2>应用 · 深色</h2>${darkSvg}</section></main>`)
      await shot('thinking-flat-light')
      nativeTheme.themeSource='dark'; await new Promise(r=>setTimeout(r,180)); await shot('thinking-flat-dark'); nativeTheme.themeSource='light'
      win.webContents.debugger.attach('1.3')
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
      await wait(`!document.querySelector('[data-activity-spark] animate')`)
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]})
      await wait(`!!document.querySelector('[data-activity-spark] animate')`)
      win.hide(); await new Promise(r=>setTimeout(r,120))
      if(await js(`!!document.querySelector('[data-activity-spark] animate')`))throw new Error('Hidden window is animating')
      win.show(); await wait(`!!document.querySelector('[data-activity-spark] animate')`)
      send(begin('child','agent'));send(block(0,'thinking','agent'));send(delta('子 Agent 的正文不能混入主摘要',0,'agent'));send(delta('\n主会话继续核对。'))
      await wait(`document.querySelector('[aria-label="思考摘要内容"]')?.textContent.includes('主会话继续核对')`)
      if(await js(`document.querySelector('main').innerText.includes('子 Agent 的正文')`))throw new Error('Subagent thinking leaked into root summary')
      await click('展开思考摘要'); await wait(`document.querySelector('[aria-label="思考摘要内容"]')?.clientHeight>63`)
      await js(`document.querySelector('[aria-label="思考摘要内容"]').scrollTop=0`); await new Promise(r=>setTimeout(r,100))
      send(delta('\n新增摘要内容。'))
      await new Promise(r=>setTimeout(r,150))
      if(await js(`document.querySelector('[aria-label="思考摘要内容"]').scrollTop`)>1)throw new Error('Streaming stole the reader scroll position')
      await click('收起思考摘要')
      send({type:'assistant',uuid:'tool-final',message:{id:'tool-message',content:[{type:'tool_use',id:'read',name:'Read',input:{file_path:join(project,'README.md')}}]}})
      await wait(`document.querySelector('[data-thinking-summary] [role="status"]')?.innerText.includes('正在读取文件')`)
      setState('awaiting');await wait(`document.querySelector('[data-thinking-summary] [role="status"]')?.innerText.includes('等待你确认')`)
      if(await js(`!!document.querySelector('[data-thinking-summary] animate')`))throw new Error('Approval wait is animating')
      setState('running');send({type:'user',message:{content:[{type:'tool_result',tool_use_id:'read',content:'ok'}]}})
      send(event({type:'content_block_start',index:1,content_block:{type:'text',text:''}}));send(event({type:'content_block_delta',index:1,delta:{type:'text_delta',text:'检查完成。'}}))
      await wait(`document.querySelector('[data-thinking-summary] [role="status"]')?.innerText.includes('正在生成回复')`)
      await checkSummaryOrder()
      await open('b');if(await js(`!!document.querySelector('[data-thinking-summary]')`))throw new Error('Summary leaked across sessions')
      await open('a');await wait(`!!document.querySelector('[data-thinking-summary]')`)
      activity.stop();flush();await wait(`document.body.innerText.includes('正在停止')`)
      if(await js(`!!document.querySelector('[data-thinking-summary] animate')`))throw new Error('Stopping is animating')
      activity.finish();flush();setState('idle')
      await wait(`!document.querySelector('[aria-label="思考摘要内容"]')`)
      await checkSummaryOrder()
      await click('展开思考摘要');await wait(`!!document.querySelector('[aria-label="思考摘要内容"]')`)
      await checkSummaryOrder()
      if(await js(`!!document.querySelector('[data-thinking-summary] animate')`))throw new Error('Finished turn is animating')
      await shot('thinking-completed')
      await click('展开右栏（⌘⇧B）');await card('基于当前会话')
      await js(`(()=>{const t=document.querySelector('aside textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'侧边问题');t.dispatchEvent(new Event('input',{bubbles:true}))})()`)
      await new Promise(r=>setTimeout(r,80));await click('提问')
      await wait(`document.querySelector('aside [role="status"]')?.innerText.includes('正在回答')&&document.querySelector('aside [data-activity-spark]')?.dataset.animated==='true'`)
      await shot('thinking-side-chat')
      await click('新建侧栏页面');await wait(`document.querySelector('aside [data-activity-spark]')?.dataset.animated==='false'`)
      answerSideQuestion('侧边回答完成。');await new Promise(r=>setTimeout(r,100))
      await js(`([...document.querySelectorAll('aside [role="tab"]')].find(e=>e.innerText.includes('侧边聊天'))).click()`)
      await wait(`document.querySelector('aside[aria-label="工作区侧栏"]')?.innerText.includes('侧边回答完成')`)
      if(await js(`!!document.querySelector('aside [role="status"]')`))throw new Error('Completed side chat still loading')
      console.log('PASS: flat Spark morph/light/dark/reduced/hidden; streamed summary preview/scroll/isolation; tool/approval/stop/completion; side chat animation')
      clearTimeout(timeout);app.quit()
    } catch(error){console.error(error);await shot('thinking-failure');clearTimeout(timeout);app.exit(1)}
  })
})
require(process.env.CLAUDE_DESK_SMOKE_ENTRY || '../out/main/index.js')
