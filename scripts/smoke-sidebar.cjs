// 运行 npm run build 后：env -u ELECTRON_RUN_AS_NODE electron scripts/smoke-sidebar.cjs
// 临时工作区；不发送 Claude 消息，不修改真实项目和用户设置。
const { app, BrowserWindow } = require('electron')
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
const output = resolve('dist/build-check')
mkdirSync(output, { recursive: true })
const server = createServer((_request, response) => { response.end('<title>Local browser test</title><h1>Embedded browser works</h1>') })
server.listen(0, '127.0.0.1')
const timeout = setTimeout(() => { console.error('Smoke test timed out'); app.exit(1) }, 60000)
app.on('browser-window-created', (_event, win) => {
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
      await wait(`!!document.querySelector('[aria-label="展开右栏（⌘⇧B）"]')`)
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
        ['example.pdf', `document.querySelector('canvas')?.width > 100 && document.body.innerText.includes('1 / 1')`]
      ]) {
        await card('工作区文件'); await click(file); await wait(condition); await shot('sidebar-' + file.split('.').pop())
      }
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
      await card('新对话')
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
      await card('新对话')
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
      console.log('PASS: previews, terminal PID and browser retained through Settings, modal visibility, explicit resource cleanup')
      console.log('Screenshots:', output)
      clearTimeout(timeout); server.close(); app.quit()
    } catch (err) { console.error(err); await shot('sidebar-failure'); clearTimeout(timeout); server.close(); app.exit(1) }
  })
})
require(process.env.CLAUDE_DESK_SMOKE_ENTRY || '../out/main/index.js')
