// 运行 npm run build 后：env -u ELECTRON_RUN_AS_NODE electron scripts/smoke-sidebar.cjs
// 临时工作区；不发送 Claude 消息，不修改真实项目和用户设置。
const { app, BrowserWindow, ipcMain } = require('electron')
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { createServer } = require('node:http')
const scratch = mkdtempSync(join(tmpdir(), 'claude-sidebar-'))
const project = join(scratch, 'project')
const userdata = join(scratch, 'userdata')
mkdirSync(project); mkdirSync(userdata)
writeFileSync(join(project, 'readme.md'), '# Sidebar preview\n\nMarkdown rendered successfully.')
writeFileSync(join(project, 'example.ts'), 'export const previewWorks = true\n')
writeFileSync(join(project, 'example.html'), '<h1>HTML preview works</h1><script>parent.document.body.innerHTML="UNSAFE"</script>')
writeFileSync(join(project, 'pixel.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64'))
// 有效的单页 PDF fixture，避免依赖额外 PDF 工具。
let pdf = '%PDF-1.4\n'
const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
const stream = 'BT /F1 18 Tf 30 100 Td (PDF preview works) Tj ET'
objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
const offsets = [0]
objects.forEach((body, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${body}\nendobj\n` })
const xref = Buffer.byteLength(pdf)
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
writeFileSync(join(project, 'example.pdf'), pdf)
writeFileSync(join(userdata, 'claude-desk.json'), JSON.stringify({ version: 1, projects: [{ id: 'smoke', name: '预览验证', path: project, addedAt: 0, collapsed: false }], archived: {}, settings: { theme: 'light' }, seededFromHistory: true }))
process.env.CLAUDE_DESK_USERDATA = userdata
// 固定两个合成会话，避免触发真实 Claude 请求。
const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (name, handler) => {
  const stubs = {
    'sessions:list': () => ['a', 'b'].map(id => ({ id, title: '侧栏测试会话 ' + id, cwd: project, lastModified: 0, archived: false })),
    'chat:open': () => ({ messages: [], state: 'idle', approvals: [], live: false }),
    'chat:context': () => null, 'chat:checkExternal': () => false,
    'meta:get': () => ({ models: [], subscriptionType: null, claudeVersion: 'fixture' }),
    'meta:commands': () => [],
    'meta:usage': () => ({ subscriptionType: null, available: false, windows: [] }),
    'chat:btw': async (_event, _id, _path, question) => { await new Promise(r => setTimeout(r, 150)); return '测试回答：' + question }
  }
  originalHandle(name, stubs[name] || handler)
}
const output = resolve('dist/build-check')
mkdirSync(output, { recursive: true })
const server = createServer((_request, response) => { response.end('<title>Local browser test</title><h1>Embedded browser works</h1>') })
server.listen(0, '127.0.0.1')
const timeout = setTimeout(() => { console.error('Smoke test timed out'); app.exit(1) }, 60000)
app.on('browser-window-created', (_event, win) => {
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_request, callback) => callback({ cancel: true }))
  win.webContents.on('console-message', (event) => { if (event.level === 'error') console.error('[renderer]', event.message) })
  win.webContents.once('did-finish-load', async () => {
    const js = (code) => win.webContents.executeJavaScript(code, true)
    const wait = async (code) => {
      for (let i = 0; i < 120; i++) { if (await js(code)) return; await new Promise((r) => setTimeout(r, 100)) }
      throw new Error('Condition failed: ' + code)
    }
    const click = async (label) => {
      const done = await js(`(() => {const e=[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)} && e.offsetParent);e?.click();return !!e})()`)
      if (!done) throw new Error('Button missing: ' + label)
    }
    const card = async (text) => {
      const done = await js(`(() => {const e=[...document.querySelectorAll('button')].find(e=>e.innerText.includes(${JSON.stringify(text)}) && e.offsetParent);e?.click();return !!e})()`)
      if (!done) throw new Error('Card missing: ' + text)
    }
    const shot = async (name) => writeFileSync(join(output, name + '.png'), (await win.capturePage()).toPNG())
    try {
      await wait(`document.body.innerText.includes('侧栏测试会话 a')`)
      if (await js(`!!document.querySelector('[data-page-count]')`)) throw new Error('Home exposes sidebar toggle')
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', {key:'B',metaKey:true,shiftKey:true,bubbles:true}))`)
      if (await js(`!!document.querySelector('aside[aria-label="工作区侧栏"]')`)) throw new Error('Shortcut opened sidebar on home')
      const openSession = async (id) => { await js(`([...document.querySelectorAll('[role="button"]')].find(e=>e.innerText.includes('侧栏测试会话 ${id}'))).click()`); await wait(`!!document.querySelector('[data-page-count]')`) }
      await openSession('a')
      if (await js(`document.querySelector('[data-page-count]').dataset.pageCount`) !== '0') throw new Error('New conversation has eager sidebar tabs')
      await click('展开右栏（⌘⇧B）')
      await wait(`document.body.innerText.includes('浏览会话工作区的文件')`)
      await shot('sidebar-start')
      await click('展开侧栏页面')
      await shot('sidebar-start-expanded')
      await click('还原侧栏宽度')
      await card('工作区文件')
      await wait(`!!document.querySelector('[aria-label="readme.md"]')`)
      await click('readme.md')
      await wait(`!!document.querySelector('aside .md h1')`)
      await shot('sidebar-markdown')
      for (const [file, condition] of [
        ['example.ts', `document.querySelector('.code-lines')?.textContent.includes('previewWorks')`],
        ['pixel.png', `document.querySelector('img[alt="pixel.png"]')?.naturalWidth === 1`],
        ['example.html', `!!document.querySelector('iframe[title="example.html"]')`],
        ['example.docx', `!!document.querySelector('iframe[title="DOCX 文档预览"]')?.srcdoc.includes('中文文档')`],
        ['example.xlsx', `document.querySelector('[role="grid"]')?.innerText.includes('产品')`],
        ['example.xls', `document.querySelector('[role="grid"]')?.innerText.includes('产品')`],
        ['chinese.pdf', `document.querySelector('canvas')?.width > 100 && document.body.innerText.includes('1 / 1')`],
        ['scanned.pdf', `document.querySelector('canvas')?.width > 100 && document.body.innerText.includes('1 / 1')`],
        ['example.pdf', `document.querySelector('canvas')?.width > 100 && document.body.innerText.includes('1 / 1')`]
      ]) {
        await card('工作区文件'); await click(file); await wait(condition)
        if (file === 'example.docx') {
          let loaded = false
          for (let i = 0; i < 100; i++) {
            if (!win.webContents.debugger.isAttached()) win.webContents.debugger.attach('1.3')
            const targets = await win.webContents.debugger.sendCommand('Target.getTargets')
            const target = targets.targetInfos.find(target => target.type === 'iframe' && target.url === 'about:srcdoc')
            const attached = target ? await win.webContents.debugger.sendCommand('Target.attachToTarget', { targetId: target.targetId, flatten: true }) : null
            const snapshot = await win.webContents.debugger.sendCommand('DOMSnapshot.captureSnapshot', { computedStyles: [] }, attached?.sessionId)
            if (attached) await win.webContents.debugger.sendCommand('Target.detachFromTarget', { sessionId: attached.sessionId })
            const frame = snapshot.documents.find(frame => snapshot.strings[frame.documentURL] === 'about:srcdoc')
            const text = frame?.nodes.nodeValue.map(index => snapshot.strings[index]).join(' ') ?? ''
            if (text.includes('中文文档') && text.includes('项目') && frame.nodes.nodeName.some(index => snapshot.strings[index] === 'IMG')) { loaded = true; break }
            await new Promise(r => setTimeout(r, 100))
          }
          if (!loaded) throw new Error('DOCX did not render text, table and image in its sandbox')
        }
        await new Promise(r => setTimeout(r, 150))
        await shot('sidebar-' + file.replace('.', '-'))
      }
      await card('工作区文件'); await click('protected.pdf')
      await wait(`!!document.querySelector('input[aria-label="PDF 密码"]')`)
      const fill = async (selector, value) => { await js(`(() => {const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`); await new Promise(r=>setTimeout(r,60)) }
      await fill('[aria-label="PDF 密码"]', 'wrong'); await card('解锁 PDF')
      await wait(`document.body.innerText.includes('密码不正确')`)
      await fill('[aria-label="PDF 密码"]', 'preview'); await card('解锁 PDF')
      await wait(`document.querySelector('canvas')?.width > 100 && document.body.innerText.includes('1 / 1')`)
      await card('工作区文件'); await click('broken.pdf')
      await wait(`document.querySelector('[role="alert"]')?.innerText.includes('无法读取 PDF')`)
      await card('工作区文件'); await click('example.xlsx')
      await wait(`document.querySelector('[role="grid"]')?.innerText.includes('产品')`)
      await card('大表')
      await wait(`document.querySelector('[role="grid"]')?.getAttribute('aria-rowcount') === '20000'`)
      await js(`document.querySelector('[role="grid"]').scrollTop=28000`)
      await wait(`document.querySelector('[role="grid"]')?.innerText.includes('row-1000')`)
      if (await js(`document.querySelectorAll('[role="gridcell"]').length`) > 2000) throw new Error('Spreadsheet rendered too many cells')
      await shot('sidebar-spreadsheet-large')
      await click('新建侧栏页面'); await card('基于当前会话')
      await wait(`!!document.querySelector('textarea[placeholder="顺便问一下…"]')`)
      await fill('textarea[placeholder="顺便问一下…"]', '保留的草稿')
      await openSession('b')
      if (await js(`document.querySelector('[data-page-count]').dataset.pageCount`) !== '0') throw new Error('Session B inherited tabs')
      await click('展开右栏（⌘⇧B）'); await card('基于当前会话')
      await wait(`!!document.querySelector('textarea[placeholder="顺便问一下…"]')`)
      if (await js(`document.querySelector('textarea[placeholder="顺便问一下…"]').value`)) throw new Error('Draft leaked to session B')
      await openSession('a')
      await wait(`document.querySelector('textarea[placeholder="顺便问一下…"]')?.value === '保留的草稿'`)
      await click('提问')
      await wait(`document.body.innerText.includes('测试回答：保留的草稿')`)
      await click('新建侧栏页面'); await card('基于当前会话')
      await wait(`!!document.querySelector('button[aria-label="向我提问"]')`)
      if (await js(`document.querySelector('aside').innerText.includes('测试回答：保留的草稿')`)) throw new Error('Second chat inherited first history')
      await click('新建侧栏页面'); await card('新建终端')
      await js(`window.__terminalData='';window.desk.terminal.onData((id,data)=>{window.__terminalId=id;window.__terminalData+=data});true`)
      await wait(`!!document.querySelector('.xterm-helper-textarea')`)
      // 首屏 shell 输出可能早于监听，因此发送真实按键来触发 PTY 回显。
      win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
      await wait(`!!window.__terminalId`)
      await js(`window.desk.terminal.write(window.__terminalId, ${JSON.stringify('printf "PTY_OK\\n"; pwd\r')})`)
      await wait(`window.__terminalData.includes('PTY_OK') && window.__terminalData.includes(${JSON.stringify(project)})`)
      await shot('sidebar-terminal')
      await js(`window.__terminalData='';window.desk.terminal.write(window.__terminalId, ${JSON.stringify('printf "\\nSHELL_ID:%s\\n" "$$"\r')})`)
      await wait(`/[\\r\\n]SHELL_ID:(\\d+)/.test(window.__terminalData)`)
      const shellPid = Number(await js(`window.__terminalData.match(/[\\r\\n]SHELL_ID:(\\d+)/)[1]`))
      await card('设置')
      await wait(`!document.querySelector('.xterm-helper-textarea')`)
      process.kill(shellPid, 0) // 查看设置不应销毁终端进程。
      await openSession('a')
      await wait(`!!document.querySelector('.xterm-helper-textarea')`)
      await js(`window.__terminalData='';window.desk.terminal.write(window.__terminalId, ${JSON.stringify('printf "\\nRESTORED_ID:%s\\n" "$$"\r')})`)
      await wait(`window.__terminalData.includes('RESTORED_ID:${shellPid}')`)

      await click('新建侧栏页面'); await card('浏览器')
      await js(`window.__browserReady = new Promise(resolve => window.desk.browser.onState((id,state)=>{window.__browserId=id;if(state.title==='Local browser test'&&!state.loading)resolve(state)}));true`)
      const url = `http://127.0.0.1:${server.address().port}/`
      await wait(`!!document.querySelector('input[aria-label="网址"]')`)
      await js(`(() => {const input=document.querySelector('input[aria-label="网址"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(url)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
      await new Promise((r) => setTimeout(r, 100))
      await js(`document.querySelector('input[aria-label="网址"]').closest('form').requestSubmit()`)
      await wait(`!!window.__browserId`)
      await js(`window.__browserReady`)
      await new Promise((r) => setTimeout(r, 250))
      const guest = win.contentView.children.find((child) => child.webContents && child.webContents !== win.webContents)
      const guestContents = guest?.webContents
      if (!guest?.getVisible() || guest.getBounds().width < 100) throw new Error('Browser is not visible inside the sidebar')
      if (!(await guest.webContents.executeJavaScript('document.body.innerText')).includes('Embedded browser works')) throw new Error('Browser content missing')
      writeFileSync(join(output, 'sidebar-browser-content.png'), (await guest.webContents.capturePage()).toPNG())
      await shot('sidebar-browser')
      await card('设置')
      await wait(`!document.querySelector('input[aria-label="网址"]')`)
      await new Promise((r) => setTimeout(r, 100))
      if (guest.webContents.isDestroyed() || guest.getVisible()) throw new Error('Settings should hide, not destroy, the browser')
      await openSession('a')
      await wait(`document.querySelector('input[aria-label="网址"]')?.value === ${JSON.stringify(url)}`)
      await new Promise((r) => setTimeout(r, 100))
      if (!guest.getVisible()) throw new Error('Existing browser not restored')
      await click('展开侧栏页面')
      // 项目操作按钮默认仅在 hover 时显示；显式显示它以便无鼠标验证。
      await js(`document.querySelector('button[aria-label="更多"]').closest('span').style.display='flex'`)
      await js(`document.querySelector('button[aria-label="更多"]').click()`)
      await wait(`!!document.querySelector('[role="menuitem"]')`)
      await card('从列表中移除')
      await wait(`!!document.querySelector('[role="dialog"]')`)
      await new Promise((r) => setTimeout(r, 100))
      if (guest.getVisible()) throw new Error('Native browser covers modal dialog')
      await card('取消')
      await new Promise((r) => setTimeout(r, 100))
      if (!guest.getVisible()) throw new Error('Browser not restored after dismissing dialog')
      await click('还原侧栏宽度')
      await click('新建侧栏页面')
      await new Promise((r) => setTimeout(r, 200))
      if (win.contentView.children.some((child) => child.webContents && child.webContents !== win.webContents && child.getVisible())) throw new Error('Browser overlays start page')
      await click('关闭终端')
      await new Promise((r) => setTimeout(r, 200))
      let shellAlive = false
      try { process.kill(shellPid, 0); shellAlive = true } catch { /* 已退出 */ }
      if (shellAlive) throw new Error('Closing terminal tab did not release its process')
      await click('关闭浏览器')
      await new Promise((r) => setTimeout(r, 100))
      if (!guestContents.isDestroyed()) throw new Error('Closing browser tab did not release its view')
      await js(`([...document.querySelectorAll('[role="button"]')].find(e=>e.innerText.includes('侧栏测试会话 a'))).querySelector('[aria-label="归档"]').click()`)
      await wait(`!document.querySelector('[data-page-count]') && !document.querySelector('aside[aria-label="工作区侧栏"]')`)
      console.log('PASS: session gating/isolation/archive, independent side chats, DOCX/XLSX/XLS and PDF/password previews, terminal PID and browser retained through Settings, modal visibility, explicit resource cleanup')
      console.log('Screenshots:', output)
      clearTimeout(timeout); server.close(); app.quit()
    } catch (err) { console.error(err); await shot('sidebar-failure'); clearTimeout(timeout); server.close(); app.exit(1) }
  })
})
require('./preview-fixtures.cjs').writeFixtures(project).then(() => require(process.env.CLAUDE_DESK_SMOKE_ENTRY || '../out/main/index.js')).catch(error => { console.error(error); app.exit(1) })
