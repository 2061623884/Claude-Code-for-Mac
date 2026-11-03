// Real built-in CLI, isolated desktop data, synthetic slash command only.
const { app } = require('electron')
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const scratch = mkdtempSync(join(tmpdir(), 'desk-ultra-'))
const project = join(scratch, 'project')
const userdata = join(scratch, 'userdata')
mkdirSync(project); mkdirSync(userdata)
mkdirSync(join(project,'.claude'))
writeFileSync(join(project,'.claude/settings.json'), JSON.stringify({enableWorkflows:false}))
writeFileSync(join(userdata, 'claude-desk.json'), JSON.stringify({
  version: 1, projects: [{id:'p',name:'Ultracode 验证',path:project,addedAt:0,collapsed:false}],
  archived:{}, settings:{theme:'light',reduceMotion:false}, seededFromHistory:true
}))
process.env.CLAUDE_DESK_USERDATA = userdata
const timeout = setTimeout(() => { console.error('timeout'); app.exit(1) }, 60000)
app.on('browser-window-created', (_, win) => {
  win.webContents.once('did-finish-load', async () => {
    const js = code => win.webContents.executeJavaScript(code, true)
    const wait = async code => {
      for (let i=0; i<200; i++) {
        if (await js(code)) return
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      throw Error('condition: '+code)
    }
    const click = name => js(`(()=>{const e=[...document.querySelectorAll('button,input[type=checkbox]')].find(e=>e.offsetParent&&(e.getAttribute('aria-label')===${JSON.stringify(name)}||e.textContent===${JSON.stringify(name)}));if(!e)throw Error('button missing '+${JSON.stringify(name)});e.click()})()`)
    const type = async text => { await wait("document.querySelector('[data-composer]').innerText.trim()===''"); return js(`(()=>{const e=document.querySelector('[data-composer]');e.focus();document.execCommand('selectAll');document.execCommand('insertText',false,${JSON.stringify(text)})})()`) }
    try {
      await wait("!!document.querySelector('[data-composer]')")
      const openPicker = async () => {
        if (!await js("!!document.querySelector('[aria-label=思考程度列表]')")) await click('选择思考程度')
      }
      const closePicker = () => js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))")
      const projectChip = "[...document.querySelectorAll('[data-composer-surface] button')].find(b=>b.textContent==='Ultracode 验证')"
      await js(projectChip + '.click()')
      await wait("document.querySelector('[role=menu]').getBoundingClientRect().bottom <= " + projectChip + ".getBoundingClientRect().top")
      await closePicker()
      await openPicker()
      await wait("document.querySelector('[aria-label=思考程度列表] button[aria-label=高]')?.parentElement === document.querySelector('[aria-label=Ultracode]')?.closest('label')?.parentElement && !!document.querySelector('[aria-label=Ultracode]')")
      await closePicker()
      await click('默认')
      await wait("document.querySelector('[role=menu]').getBoundingClientRect().bottom <= [...document.querySelectorAll('button')].find(b=>b.textContent==='默认').getBoundingClientRect().top")
      await closePicker()
      const surfaceStyle = "getComputedStyle(document.querySelector('[data-composer-surface]'))"
      const baseColor = await js(surfaceStyle + '.backgroundColor')
      await click('选择模型')
      await wait("document.querySelector('[aria-label=模型列表]').getBoundingClientRect().bottom <= document.querySelector('[aria-label=选择模型]').getBoundingClientRect().top && document.querySelector('[aria-label=模型列表]').getBoundingClientRect().height > 30")
      await wait("document.querySelector('[aria-label=模型列表] button .model-choice-name') && getComputedStyle(document.querySelector('[aria-label=模型列表] button .model-choice-name')).fontSize === getComputedStyle(document.querySelector('.fast-option .model-choice-name')).fontSize && !document.querySelector('[aria-label=模型列表] button small')")
      const hover = async selector => {
        const point = await js(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.floor(r.x+r.width/2),y:Math.floor(r.y+r.height/2)}})()`)
        win.webContents.sendInputEvent({ type:'mouseMove', ...point })
      }
      await hover('.fast-option .model-choice-name')
      await wait("getComputedStyle(document.querySelector('.fast-hint')).visibility==='hidden'")
      await hover('input[aria-label=Fast]')
      await wait("getComputedStyle(document.querySelector('.fast-hint')).visibility==='visible'")
      await js("document.querySelector('input[aria-label=Fast]').click()")
      await wait("!!document.querySelector('.crab-run') && getComputedStyle(document.querySelector('.crab-speed i')).backgroundColor==='rgb(25, 24, 22)'")
      const glow = "!!document.querySelector('[data-composer-surface][data-ultracode]') && !!document.querySelector('.violet-pixel')"
      const plain = "!document.querySelector('[data-composer-surface][data-ultracode], .violet-pixel')"
      await wait("document.querySelector('input[aria-label=Fast]').checked && " + plain)
      await js("document.querySelector('input[aria-label=\"Fast\"]').click()")
      await openPicker()
      await click('Ultracode')
      await wait(glow)
      if (await js(surfaceStyle+'.backgroundColor') !== baseColor) throw Error('Composer interior color changed')
      const angle = "getComputedStyle(document.querySelector('[data-composer-surface]'),'::after').getPropertyValue('--ultra-angle')"
      const initialAngle = await js(angle)
      await wait(angle+' !== '+JSON.stringify(initialAngle))
      await closePicker()
      await type('/effort status')
      await js(`window.flashFrames=0;window.sampling=true;requestAnimationFrame(function sample(){
        if (!window.sampling) return;
        for(const el of document.querySelectorAll('[data-composer-surface]')) {
          if (!el.hasAttribute('data-ultracode') || !getComputedStyle(el.querySelector('[data-composer-action]')).backgroundImage.includes('conic-gradient')) window.flashFrames++;
        } requestAnimationFrame(sample);
      });void 0`)
      await click('发送')
      await wait("document.body.innerText.includes('Ultracode on')")
      await js('window.sampling=false')
      if(await js('window.flashFrames')) throw Error('Orange composer frame during first send')
      await openPicker()
      const active = "document.querySelector('[aria-label=Ultracode]')?.checked===true"
      await wait(active)
      await wait("!document.querySelector('[aria-label=Ultracode]').disabled")
      await wait(glow)
      // Release the live worker, then reopen an already-enabled conversation without sending a prompt.
      const saved = require('node:fs').readdirSync(join(userdata, 'session-preferences')).find(name => name.endsWith('.json'))
      const args = JSON.stringify(saved.slice(0,-5)) + ',' + JSON.stringify(project)
      await js('window.desk.chat.reload('+args+').then(()=>true)')
      const restored = await js('window.desk.chat.open('+args+').then(s=>s.runtime?.ultracode)')
      if (restored !== true) throw Error('Ultracode not restored from saved conversation')
      await wait(glow)
      if (await js("document.body.innerText.includes('实际模型')")) throw Error('unexpected runtime caption')
      await closePicker()
      await type('/effort high')
      await click('发送')
      await wait("document.querySelector('[aria-label=选择思考程度]').textContent.includes('高')")
      await openPicker()
      await wait(active)
      await wait("!document.querySelector('[aria-label=思考程度列表] button').disabled")
      await click('自动')
      await wait("document.querySelector('[aria-label=选择思考程度]').textContent.includes('自动')")
      await click('选择模型')
      await wait("!document.querySelector('[aria-label=\"Fast\"]').disabled")
      await js("document.querySelector('[aria-label=\"Fast\"]').click()")
      await wait("document.body.innerText.includes('额外用量未启用') || document.querySelector('input[type=checkbox]')?.checked")
      const output = resolve('dist/build-check')
      mkdirSync(output,{recursive:true})
      writeFileSync(join(output,'mode-picker.png'),(await win.capturePage()).toPNG())
      await openPicker()
      await click('Ultracode')
      await wait("document.querySelector('[aria-label=Ultracode]').checked===false")
      await wait(plain)
      console.log('PASS real CLI: homepage switch, chat commands, high/auto preservation, command on/off, button off')
      clearTimeout(timeout); app.quit()
    } catch(e) {
      console.error(e)
      console.error((await js("document.body.innerText")).slice(-3000))
      clearTimeout(timeout);app.exit(1)
    }
  })
})
require('../out/main/index.js')
