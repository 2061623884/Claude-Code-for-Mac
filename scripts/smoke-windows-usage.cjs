// Live read-only quota check. Sends no model messages and leaves CLI settings intact.
const { app } = require('electron')
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync } = require('node:fs')
const { tmpdir, homedir } = require('node:os')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const data = mkdtempSync(join(tmpdir(), 'claude-usage-check-'))
const settingsFile = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json')
const before = readFileSync(settingsFile)
writeFileSync(join(data, 'claude-desk.json'), JSON.stringify({ version: 1, projects: [], archived: {}, settings: { theme: 'light' }, seededFromHistory: true }))
process.env.CLAUDE_DESK_USERDATA = data
process.env.CLAUDE_DESK_DEMO = '{}'
const timeout = setTimeout(() => { console.error('FAIL usage smoke timed out'); app.exit(1) }, 60000)
app.once('browser-window-created', (_event, win) => {
  win.show = () => {}; win.showInactive = () => {}
  win.webContents.once('did-finish-load', async () => {
    const js = code => win.webContents.executeJavaScript(code, true)
    const wait = async code => {
      const until = Date.now() + 30000
      while (Date.now() < until) { if (await js(code)) return; await new Promise(resolve => setTimeout(resolve, 100)) }
      throw Error('Timed out: ' + code)
    }
    try {
      const overview = await js('window.desk.usage.overview()')
      assert.equal(overview.usageError, undefined)
      assert.equal(overview.usage.available, true)
      assert.ok(overview.usage.windows.some(w => w.kind === 'five_hour'))
      assert.ok(overview.usage.windows.some(w => w.kind === 'seven_day'))
      await wait("!!document.querySelector('[aria-label=\"剩余额度\"]')")
      await js("document.querySelector('[aria-label=\"剩余额度\"]').click()")
      await wait("!!document.querySelector('section[aria-label=\"套餐额度\"]')&&document.querySelector('section[aria-label=\"套餐额度\"]').innerText.includes('本周（所有模型）')")
      const text = await js("document.querySelector('section[aria-label=\"套餐额度\"]').innerText")
      assert.ok(!text.includes('读取失败') && !text.includes('暂时无法'))
      assert.deepEqual(readFileSync(settingsFile), before)
      await wait("!document.getElementById('splash')")
      mkdirSync(resolve('.local'), { recursive: true })
      writeFileSync(resolve('.local/windows-usage-fixed.png'), (await win.capturePage()).toPNG())
      const report = { passed: true, realSdk: true, modelRequestSent: false, cliSettingsUnchanged: true, windows: overview.usage.windows }
      writeFileSync(resolve('.local/windows-usage-fixed.json'), JSON.stringify(report, null, 2))
      console.log(JSON.stringify(report)); clearTimeout(timeout); app.quit()
    } catch (error) {
      console.error('FAIL', error.message); clearTimeout(timeout)
      app.once('will-quit', event => { event.preventDefault(); app.exit(1) }); app.quit()
    }
  })
})
require(resolve('out/main/index.js'))
