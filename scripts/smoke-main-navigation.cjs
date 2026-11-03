// Hidden Electron window and local HTTP fixtures. No user data or privileged API calls.
const { app, BrowserWindow } = require('electron')
const { createServer } = require('node:http')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { once } = require('node:events')
const { buildSync } = require('esbuild')
const scratch = mkdtempSync(join(tmpdir(), 'desk-nav-'))
buildSync({ entryPoints: [resolve('src/main/appWindow.ts'), resolve('src/preload/index.ts')], outdir: scratch, outbase: 'src', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
const { AppWindow } = require(join(scratch, 'main/appWindow.js'))
app.setPath('userData', scratch)
BrowserWindow.prototype.show = function () {}
BrowserWindow.prototype.focus = function () {}
const timeout = setTimeout(() => { console.error('Navigation test timed out'); app.exit(1) }, 15000)
const server = createServer((request, response) => {
  if (request.url === '/?redirect') { response.writeHead(302, { Location: '/external' }); response.end(); return }
  response.writeHead(200, { 'Content-Type': 'text/html' })
  response.end('<!doctype html><title>navigation fixture</title>')
})
app.whenReady().then(() => server.listen(0, '127.0.0.1', () => {
  const base = `http://127.0.0.1:${server.address().port}`
  process.env.ELECTRON_RENDERER_URL = base + '/'
  app.once('browser-window-created', (_event, win) => {
    win.webContents.once('did-finish-load', async () => {
      try {
        const run = code => win.webContents.executeJavaScript(code)
        if (!await run("typeof window.desk?.meta?.get === 'function'")) throw new Error('Application preload missing')
        const frameLoaded = await run(`new Promise(resolve => { const f=document.createElement('iframe'); f.src='${base}/frame'; f.onload=()=>resolve(true); document.body.append(f) })`)
        if (!frameLoaded) throw new Error('iframe did not load')
        for (const [eventName, path] of [['will-navigate', '/external'], ['will-redirect', '/?redirect']]) {
          const observed = once(win.webContents, eventName)
          await run(`location.href='${base}${path}'`)
          const [event] = await observed
          if (!event.defaultPrevented || win.webContents.getURL() !== base + '/') throw new Error('Unexpected navigation: ' + eventName)
        }
        console.log('Main frame navigation and redirect blocked; iframe loaded')
        clearTimeout(timeout); win.destroy(); server.close(); rmSync(scratch, { recursive: true, force: true }); app.exit(0)
      } catch (error) { console.error(error); app.exit(1) }
    })
  })
  new AppWindow(() => {}).open()
}))
