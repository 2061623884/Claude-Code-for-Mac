// Offline Electron integration: real statistics worker, synthetic transcript and quota.
const { app, ipcMain, nativeTheme } = require('electron')
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const scratch = mkdtempSync(join(tmpdir(), 'claude-usage-'))
const userdata = join(scratch, 'userdata'), config = join(scratch, 'config')
mkdirSync(userdata); mkdirSync(join(config, 'projects', 'fixture', 'subagents'), { recursive: true })
process.env.CLAUDE_DESK_USERDATA = userdata
process.env.CLAUDE_CONFIG_DIR = config
writeFileSync(join(userdata, 'claude-desk.json'), JSON.stringify({ version: 1, projects: [], archived: {}, settings: { theme: 'light' }, seededFromHistory: true }))
const entries = []
for (let i = 0; i < 365; i++) {
  const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - i)
  if (i % 7 === 0 || i > 70 && i < 170) continue
  entries.push({ type: 'assistant', uuid: 'fixture-' + i, timestamp: date.toISOString(), message: { id: 'response-' + i, model: ['claude-fable-5', 'claude-opus-4-6', 'claude-sonnet-4-5', 'claude-haiku-4-5'][i % 4], usage: { input_tokens: 1000 * (i % 9 + 1), output_tokens: 1200, cache_read_input_tokens: 25000 * (i % 13), cache_creation_input_tokens: 4000 } } })
}
entries.push({ type: 'system', subtype: 'turn_duration', durationMs: 6540000 })
writeFileSync(join(config, 'projects/fixture/session.jsonl'), entries.map(e => JSON.stringify(e)).join('\n'))
writeFileSync(join(config, 'projects/fixture/subagents/agent.jsonl'), JSON.stringify(entries[0])) // dedup copy
let configAutoCompact = 'true'
let profile = { name: 'Jolin', avatar: null }, failQuota = false
const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, handler) => originalHandle(channel, ({
  'meta:configSnapshot': () => ({ cliVersion: '2.1.301', items: [{ key: 'autoCompact', values: ['true','false'], value: configAutoCompact, source: 'saved' },{ key: 'language', values: [], value: 'Chinese', source: 'saved' },{ key: 'theme', values: ['auto','dark','light'], value: 'light', source: 'saved' }] }),
  'meta:config': (_e, cwd, value) => value ? (configAutoCompact = value.split('=')[1], 'Saved '+value) : 'Usage: /config key=value\n  autoCompact=true|false\n  language=<value>\n  theme=auto|dark|light',
  'chat:mcp': () => [{ name: '示例 MCP', status: 'connected', tools: 8, scope: 'project' }],
  'meta:get': () => ({ models: [], subscriptionType: 'pro', claudeVersion: 'fixture' }),
  'usage:overview': () => { if (failQuota) throw Error('离线测试'); return { account: { key: 'fixture-account', email: 'jolin@example.com', organization: null, subscriptionType: 'Pro' }, profile, updatedAt: Date.now(), usage: { available: true, subscriptionType: 'pro', windows: [{ kind: 'five_hour', label: '5 小时内', percent: 20, resetsAt: new Date(Date.now() + 3600000).toISOString() }, { kind: 'seven_day', label: '本周（所有模型）', percent: 40, resetsAt: new Date(Date.now() + 86400000).toISOString() }] } } },
  'usage:profile': (_e, key, next) => { profile = next; return profile }
})[channel] || handler)
const out = resolve('dist/build-check'); mkdirSync(out, { recursive: true })
const timeout = setTimeout(() => { console.error('Usage smoke timed out'); app.exit(1) }, 60000)
app.on('browser-window-created', (_e, win) => {
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_request, cb) => cb({ cancel: true }))
  win.webContents.once('did-finish-load', async () => {
    const js = code => win.webContents.executeJavaScript(code, true)
    const wait = async condition => { for (let i = 0; i < 150; i++) { if (await js(condition)) return; await new Promise(r => setTimeout(r, 50)) } throw Error(condition) }
    const click = label => js(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.innerText===${JSON.stringify(label)});if(!e)throw Error('Missing '+${JSON.stringify(label)});e.click()})()`)
    const shot = async name => { await new Promise(r => setTimeout(r, 100)); writeFileSync(join(out, name + '.png'), (await win.capturePage()).toPNG()) }
    try {
      win.focus()
      await wait(`!!document.querySelector('[aria-label="剩余额度"]')`)
      await click('剩余额度')
      await wait(`document.body.innerText.includes('jolin@example.com')`)
      await wait(`document.body.innerText.includes('1 小时 49 分')`)
      const stats = await js('window.desk.usage.stats(true)')
      const expected = entries.filter(e => e.type === 'assistant').reduce((n, e) => n + Object.values(e.message.usage).reduce((a, b) => a + b, 0), 0)
      if (stats.total !== expected) throw Error(`Worker total ${stats.total} != ${expected}`)
      if (stats.longestTaskMs !== 6540000) throw Error('Duration missing')
      if (!(await js(`document.querySelector('[aria-label="剩余额度"]').innerText.includes('5h 80% · 周 60%')`))) throw Error('Quota reversed')
      if(await js(`document.querySelector('main').innerText.includes('更新于')||document.querySelector('main').innerText.includes('每格代表')`))throw Error('Persistent helper text'); await shot('usage-daily-light'); await js(`document.querySelector('[aria-label="Token 活动"]').scrollIntoView({block:'center'})`); await shot('usage-heatmap')
      await click('每周'); await wait(`!!document.querySelector('[aria-label="每周 Token 方格图"]')`); await js(`document.querySelector('[aria-label="每周 Token 方格图"] button:last-child').focus()`); await wait(`!!document.querySelector('[aria-label="用量明细"]')`); await shot('usage-weekly')
      await click('累计'); await wait(`!!document.querySelector('[aria-label="累计 Token 方格图"]')`); await shot('usage-cumulative')
      for (const model of ['fable', 'opus', 'sonnet', 'haiku']) {
        const expectedModel = entries.filter(e => e.message?.model?.includes(model)).reduce((n, e) => n + Object.values(e.message.usage).reduce((a, b) => a + b, 0), 0)
        const actualModel = stats.days.reduce((n, day) => n + Object.values(day.byModel?.[model] || {}).reduce((a, b) => a + b, 0), 0)
        if (actualModel !== expectedModel) throw Error(`${model} worker total ${actualModel} != ${expectedModel}`)
        await click(model[0].toUpperCase() + model.slice(1))
        const formatted = expectedModel >= 100000000 ? `${Number((expectedModel / 100000000).toFixed(1))} 亿` : expectedModel >= 10000 ? `${Number((expectedModel / 10000).toFixed(1))} 万` : expectedModel.toLocaleString('zh-CN')
        await wait(`document.querySelector('[data-usage-metric="累计 Token"]').lastElementChild.textContent===${JSON.stringify(formatted)}`)
      }
      await shot('usage-model-filter'); await click('Total')
      await js(`document.querySelector('main > div:last-child').scrollTop=0`); await click('编辑个人展示资料')
      await js(`(async()=>{const canvas=document.createElement('canvas');canvas.width=300;canvas.height=180;const c=canvas.getContext('2d');c.fillStyle='#dd7755';c.fillRect(0,0,300,180);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const data=new DataTransfer();data.items.add(new File([blob],'avatar.png',{type:'image/png'}));const input=document.querySelector('input[type="file"]');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`)
      await wait(`!!document.querySelector('img[alt="头像预览"]')`)
      await js(`(()=>{const e=document.querySelector('input[maxlength="80"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'本机昵称');e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
      await new Promise(r => setTimeout(r, 80)); await click('保存'); await wait(`!document.querySelector('[role="dialog"]')&&document.body.innerText.includes('本机昵称')`); if(!profile.avatar?.startsWith('data:image/png;base64,'))throw Error('Avatar not saved'); await shot('usage-profile-saved')
      await click('设置'); await wait(`!![...document.querySelectorAll('h1')].find(e=>e.innerText==='设置')`)
      if (await js(`document.querySelector('main').innerText.includes('套餐额度')`)) throw Error('Duplicate quota in settings')
      await click('上下文'); await wait(`!!document.querySelector('#config-autoCompact')`)
      await js(`document.querySelector('#config-autoCompact').click()`)
      await wait(`document.body.innerText.includes('已保存')&&document.querySelector('#config-autoCompact').getAttribute('aria-checked')==='false'`); await shot('settings-claude-code')
      await click('高级设置'); await wait(`document.querySelector('main').innerText.includes('文件检查点')`)
      if (await js(`!!document.querySelector('main details')`)) throw Error('Settings are still collapsible')
      await shot('settings-expanded')
      await click('连接与 MCP'); await wait(`document.body.innerText.includes('示例 MCP')`); await shot('settings-mcp')
      await click('剩余额度'); await wait(`document.body.innerText.includes('本机昵称')`)
      await click('每天')
      await js(`document.querySelector('[aria-label="Token 活动"]').scrollIntoView({block:'center'})`); nativeTheme.themeSource = 'dark'; await new Promise(r => setTimeout(r, 100)); await shot('usage-daily-dark')
      nativeTheme.themeSource = 'light'; win.setSize(960, 740); await new Promise(r => setTimeout(r, 150)); await shot('usage-narrow')
      if (await js(`document.documentElement.scrollWidth>innerWidth`)) throw Error('Page horizontal overflow')
      const navFits = await js(`(()=>{const e=document.querySelector('[aria-label="剩余额度"]');return e.scrollWidth<=e.clientWidth})()`)
      if (!navFits) throw Error('Sidebar quota overflow')
      failQuota = true; await click('刷新使用情况'); await wait(`document.body.innerText.includes('已有数据为上次结果')`)
      await shot('usage-offline')
      console.log('Usage smoke passed: real worker, dedup, charts, profile, routing, themes, narrow layout, offline cache')
      clearTimeout(timeout); app.exit(0)
    } catch (error) { console.error(error); await shot('usage-failure'); clearTimeout(timeout); app.exit(1) }
  })
})
require(process.env.CLAUDE_DESK_SMOKE_ENTRY || resolve('out/main/index.js'))
