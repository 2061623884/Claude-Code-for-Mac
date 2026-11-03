// Run with Electron after building. No prompt is sent. Uses real SDK metadata and credentials.
// CLAUDE_STARTUP_ENTRY selects the compiled main entry. CLAUDE_STARTUP_DATA and
// CLAUDE_STARTUP_PROJECT select isolated directories, retained across runs for cache tests.
const { app, ipcMain } = require('electron')
const { mkdirSync, existsSync, writeFileSync } = require('node:fs')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const scratch = mkdtempSync(join(tmpdir(), 'claude-startup-'))
const data = resolve(process.env.CLAUDE_STARTUP_DATA || join(scratch, 'data'))
const project = resolve(process.env.CLAUDE_STARTUP_PROJECT || join(scratch, 'project'))
mkdirSync(data, { recursive: true })
mkdirSync(project, { recursive: true })
const settings = join(data, 'claude-desk.json')
if (!existsSync(settings)) writeFileSync(settings, JSON.stringify({ version: 1, projects: [{ id: 'p', name: 'Startup test', path: project, addedAt: 0, collapsed: false }], archived: {}, settings: { theme: 'light' }, seededFromHistory: true }))
process.env.CLAUDE_DESK_USERDATA = data
const elapsed = () => Math.round(process.uptime() * 1000)
const requests = []
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => handle(channel, channel === 'meta:get' ? async (...args) => {
  const request = { started: elapsed() }
  requests.push(request)
  try { const result = await listener(...args); request.finished = elapsed(); request.modelCount = result.models.length; return result }
  catch (error) { request.finished = elapsed(); request.failed = true; throw error }
} : listener)
const timer = setTimeout(() => { console.error('FAIL startup timed out', JSON.stringify({ requests })); app.exit(1) }, 45000)
app.once('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    const js = code => win.webContents.executeJavaScript(code, true)
    const wait = async (condition, label) => {
      const end = Date.now() + 35000
      while (Date.now() < end) {
        if (await js(condition)) return elapsed()
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      throw new Error('Timed out waiting for ' + label)
    }
    const click = label => js(`document.querySelector(${JSON.stringify('button[aria-label="' + label + '"]')}).click()`)
    try {
      const firstScreen = await wait(`!!document.querySelector('button[aria-label="选择模型"]')`, 'first screen')
      await click('选择模型')
      const modelReady = await wait(`!!document.querySelector('[aria-label="模型列表"] button[aria-pressed]:not(:disabled)')`, 'model choices')
      const modelCount = await js(`document.querySelectorAll('[aria-label="模型列表"] button[aria-pressed]:not(:disabled)').length`)
      await js(`document.querySelector('[aria-label="模型列表"] button[aria-pressed]:not(:disabled)').click()`)
      await click('选择思考程度')
      const effortReady = await wait(`document.querySelectorAll('[aria-label="思考程度列表"] button[aria-pressed]:not(:disabled)').length > 1`, 'manual effort choices')
      const effortCount = await js(`document.querySelectorAll('[aria-label="思考程度列表"] button[aria-pressed]:not(:disabled)').length`)
      console.log(JSON.stringify({ firstScreenMs: firstScreen, modelReadyMs: modelReady, effortReadyMs: effortReady, modelAfterScreenMs: modelReady - firstScreen, effortAfterScreenMs: effortReady - firstScreen, modelCount, effortCount, requests }))
      clearTimeout(timer); app.quit()
    } catch (error) { console.error('FAIL', error.message, JSON.stringify({ requests })); clearTimeout(timer); app.exit(1) }
  })
})
require(resolve(process.env.CLAUDE_STARTUP_ENTRY || 'out/main/index.js'))
