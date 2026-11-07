// 宣传片中段素材：用合成 SDK 事件驱动真实界面，CDP screencast 逐帧录制。
// 不调用模型，不读取真实会话；数据目录、项目和用量记录都是临时演示数据。
// 用法：npm run build && env -u ELECTRON_RUN_AS_NODE npx electron design/promo/record.cjs
const { app, ipcMain } = require('electron')
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { buildSync } = require('esbuild')

const WIDTH = 1600, HEIGHT = 900
const RAW = resolve('design/promo/out/raw')
rmSync(RAW, { recursive: true, force: true }); mkdirSync(join(RAW, 'frames'), { recursive: true })

// ── 演示数据 ──────────────────────────────────────────────
const scratch = mkdtempSync(join(tmpdir(), 'claude-promo-'))
const project = join(scratch, 'notes-app'), userdata = join(scratch, 'userdata'), config = join(scratch, 'config')
for (const dir of [join(project, 'src/settings'), userdata, join(config, 'projects/demo')]) mkdirSync(dir, { recursive: true })
writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'notes-app', scripts: { test: 'vitest run' } }, null, 2))
writeFileSync(join(project, 'src/settings/Settings.tsx'), 'export function Settings() {\n  return <Section title="外观"><FontSize /></Section>\n}\n')
writeFileSync(join(project, 'src/theme.css'), ':root { --bg: #fff; --fg: #1f1e1d; }\n')
writeFileSync(join(userdata, 'claude-desk.json'), JSON.stringify({ version: 1, projects: [{ id: 'p', name: 'notes-app', path: project, addedAt: 0, collapsed: false }], archived: {}, settings: { theme: 'light' }, seededFromHistory: true }))
process.env.CLAUDE_DESK_USERDATA = userdata
process.env.CLAUDE_CONFIG_DIR = config

// 一年的用量记录：工作日多、周末少，最近几个月逐渐变多
const usage = []
for (let i = 0; i < 365; i++) {
  const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - i)
  const weekend = date.getDay() === 0 || date.getDay() === 6
  const wave = (Math.sin(i * 1.7) + Math.sin(i * 0.37) + 2) / 4
  if (i > 300 || (weekend && wave < 0.6) || wave < 0.12) continue
  const scale = (1 - i / 400) * (weekend ? 0.4 : 1) * (0.3 + wave)
  usage.push({ type: 'assistant', uuid: 'u' + i, timestamp: date.toISOString(), message: { id: 'r' + i, model: i % 3 ? 'claude-opus-5-5' : 'claude-sonnet-5-5', usage: { input_tokens: Math.round(9000 * scale), output_tokens: Math.round(14000 * scale), cache_read_input_tokens: Math.round(400000 * scale), cache_creation_input_tokens: Math.round(30000 * scale) } } })
}
writeFileSync(join(config, 'projects/demo/session.jsonl'), usage.map(e => JSON.stringify(e)).join('\n'))

buildSync({ entryPoints: [resolve('src/main/transcript.ts'), resolve('src/main/live/TurnActivity.ts')], outdir: join(scratch, 'code'), outbase: resolve('src/main'), outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', logLevel: 'error' })
const { Transcript } = require(join(scratch, 'code/transcript.cjs'))
const { TurnActivity } = require(join(scratch, 'code/live/TurnActivity.cjs'))
buildSync({ entryPoints: [resolve('src/renderer/components/newSession/spinnerVerbs.ts'), resolve('src/renderer/components/newSession/crabGestures.ts')], outdir: join(scratch, 'crab'), outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', logLevel: 'error' })
const { SPINNER_VERBS } = require(join(scratch, 'crab/spinnerVerbs.cjs'))
const { CRAB_GESTURES } = require(join(scratch, 'crab/crabGestures.cjs'))
// 工作中的动作由随机动词决定（与具体工具无关）；这里只挑出几种不同动作，让画面有变化
const SHOWCASE = ['thinking', 'exploring', 'cooking', 'making']

const TITLE = '给设置页加深色模式开关'
const PAST = [['h1', '重构笔记列表的虚拟滚动', 1], ['h2', '修复导出 PDF 时的中文字体', 26], ['h3', '给搜索加上拼音匹配', 50], ['h4', '整理 README 和截图', 120]]
const CONTEXT = { used: 252000, max: 1000000, percent: 25, autoCompactEnabled: true, autoCompactThreshold: 967000, buffer: 33000, parts: [{ name: 'System prompt', tokens: 2443 }, { name: 'System tools', tokens: 5989 }, { name: 'Memory files', tokens: 29 }, { name: 'Skills', tokens: 5289 }, { name: 'Messages', tokens: 238250 }] }
// 额度剩余百分比，延时段逐帧改写，再通过 online 事件让侧栏立即刷新
const quota = { five: 100, week: 75 }
let transcript, activity, sessionId, state = 'idle', onStart

const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (name, handler) => originalHandle(name, process.env.PROMO_DEBUG ? (...a) => { console.log('[ipc]', name, JSON.stringify(a.slice(1)).slice(0, 160)); return (STUBS[name] || handler)(...a) } : (STUBS[name] || handler))
const STUBS = ({
  'sessions:list': () => [
    ...(sessionId ? [{ id: sessionId, title: TITLE, cwd: project, lastModified: Date.now(), archived: false }] : []),
    ...PAST.map(([id, title, hours]) => ({ id, title, cwd: project, lastModified: Date.now() - hours * 3600e3, archived: false }))
  ],
  'chat:start': (_event, _cwd, prompt) => {
    sessionId = 'demo'; transcript = new Transcript(project); activity = new TurnActivity()
    transcript.addUser(prompt); activity.start(); state = 'running'
    setTimeout(() => onStart?.(), 30)
    return sessionId
  },
  'chat:open': (_event, id) => id === sessionId
    ? { messages: structuredClone(transcript.messages), activity: activity.snapshot(), state, approvals: [], live: true, options: { model: 'opus', effort: 'high', mode: 'default' }, optionsSaved: true }
    : { messages: [], state: 'idle', approvals: [], live: true },
  'chat:context': () => sessionId ? CONTEXT : null,
  'chat:checkExternal': () => false,
  'usage:overview': () => ({ account: { key: 'demo', email: null, organization: null, subscriptionType: 'Max' }, profile: { name: 'Demo', avatar: null }, updatedAt: Date.now(), usage: { available: true, subscriptionType: 'max', windows: [{ kind: 'five_hour', label: '5 小时内', percent: 100 - quota.five, resetsAt: new Date(Date.now() + 2 * 3600e3).toISOString() }, { kind: 'seven_day', label: '本周（所有模型）', percent: 100 - quota.week, resetsAt: new Date(Date.now() + 3 * 86400e3).toISOString() }] } }),
  'meta:get': () => ({ models: [], subscriptionType: 'max', claudeVersion: 'demo' }),
  'meta:usage': () => ({ subscriptionType: null, available: false, windows: [] }),
  'meta:commands': (_event, cwd) => ({ cwd, revision: 1, commands: [], status: 'ready', updatedAt: Date.now() })
})

// ── SDK 事件构造 ───────────────────────────────────────────
const stream = (event) => ({ type: 'stream_event', event, parent_tool_use_id: null })
const USAGE = { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 240000, cache_creation_input_tokens: 3000, cache_creation: { ephemeral_5m_input_tokens: 3000 } }
const begin = id => stream({ type: 'message_start', message: { id, usage: USAGE } })
const block = (index, type) => stream({ type: 'content_block_start', index, content_block: { type, thinking: '', text: '' } })
const thinking = (text, index = 0) => stream({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: text } })
const textDelta = (text, index = 0) => stream({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } })
const toolUse = (id, name, input) => ({ type: 'assistant', uuid: 'u-' + id, message: { id: 'm-' + id, usage: USAGE, content: [{ type: 'tool_use', id, name, input }] } })
const toolResult = (id, content) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } })

const sleep = ms => new Promise(r => setTimeout(r, ms))
const timeout = setTimeout(() => { console.error('录制超时'); app.exit(1) }, 180000)

app.on('browser-window-created', (_event, win) => {
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_request, callback) => callback({ cancel: true }))
  win.webContents.once('did-finish-load', async () => {
    const js = code => win.webContents.executeJavaScript(code, true)
    const wait = async (condition, ms = 10000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await js(condition)) return; await sleep(40) } throw Error('等待超时：' + condition) }
    const click = label => js(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&(e.getAttribute('aria-label')===${JSON.stringify(label)}||e.innerText===${JSON.stringify(label)}));if(!e)throw Error('找不到按钮 '+${JSON.stringify(label)});e.click()})()`)
    const rect = code => js(`(()=>{const r=(${code});return r&&{x:r.x,y:r.y,width:r.width,height:r.height}})()`)
    const box = selector => rect(`document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect()`)
    const hover = r => win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) })
    const status = value => wait(`document.querySelector('[data-composer-crab] [role="status"]')?.textContent===${JSON.stringify(value)}`)
    // 输入框整体：边框、右上角缓存倒计时和站在上面的螃蟹
    const composerBox = () => rect(`(()=>{const a=document.querySelector('main [data-composer-surface]').getBoundingClientRect(),b=document.querySelector('[data-composer-crab]').getBoundingClientRect();const t=Math.min(a.top,b.top);return {x:a.left,y:t,width:a.width,height:a.bottom-t}})()`)
    // 只在视频里出现的天色：夜晚是一层深蓝正片叠底，黎明是一层暖光
    const sky = (color, opacity, ms) => js(`(()=>{let e=document.getElementById('promo-sky');if(!e){e=document.createElement('div');e.id='promo-sky';e.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483647;mix-blend-mode:multiply;opacity:0';document.body.appendChild(e)}e.style.transition='opacity ${ms}ms ease, background-color ${ms}ms ease';e.style.backgroundColor='${color}';e.style.opacity='${opacity}'})()`)
    const setQuota = (five, week) => { quota.five = five; quota.week = week; return js(`dispatchEvent(new Event('online'))`) }
    const pose = (value, ms) => wait(`document.querySelector('[data-crab-pose]')?.dataset.crabPose===${JSON.stringify(value)}`, ms)
    const flush = () => {
      const messages = transcript.takeChanged(); if (messages.length) win.webContents.send('chat:onEvent', sessionId, { kind: 'upsert', messages: structuredClone(messages) })
      const value = activity.takeChanged(); if (value) win.webContents.send('chat:onEvent', sessionId, { kind: 'activity', activity: value })
    }
    const send = message => { transcript.apply(message); activity.apply(message); activity.locate(transcript.messages, message); flush() }
    const setState = value => { state = value; win.webContents.send('chat:onEvent', sessionId, { kind: 'state', state }) }
    const streamText = async (make, text, ms) => { const chunks = text.match(/.{1,3}/gsu); for (const c of chunks) { send(make(c)); await sleep(ms / chunks.length) } }

    // ── 录制 ──
    const frames = [], marks = {}, rects = {}
    let recording = false
    const mark = name => { marks[name] = Date.now() / 1000 }
    const dbg = win.webContents.debugger
    dbg.attach('1.3')
    dbg.on('message', (_e, method, params) => {
      if (method !== 'Page.screencastFrame') return
      dbg.sendCommand('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {})
      if (!recording) return
      const file = String(frames.length).padStart(5, '0') + '.jpg'
      writeFileSync(join(RAW, 'frames', file), Buffer.from(params.data, 'base64'))
      frames.push({ file, t: Date.now() / 1000 })
    })

    try {
      win.setContentSize(WIDTH, HEIGHT); win.center(); win.show(); win.focus()
      win.setAlwaysOnTop(true, 'floating')
      win.webContents.setBackgroundThrottling(false)
      await wait(`!!document.querySelector('[data-composer]')`)
      await sleep(1500)
      await dbg.sendCommand('Page.startScreencast', { format: 'jpeg', quality: 95, everyNthFrame: 1 })
      recording = true; mark('start')
      await sleep(800)

      // 1. 一句话发送，首条消息起飞
      const prompt = '给设置页加一个深色模式开关，并跑一下测试'
      await js(`document.querySelector('[data-composer]').focus()`)
      for (const ch of prompt) { await js(`document.execCommand('insertText',false,${JSON.stringify(ch)})`); await sleep(60) }
      await sleep(400)
      const started = new Promise(r => { onStart = r })
      await js(`window.__random=Math.random;Math.random=()=>0;void 0`)
      mark('send'); await click('发送')
      await started
      await js(`Math.random=window.__random;void 0`)
      flush(); setState('running')
      await sleep(1200)
      await wait(`!document.querySelector('.first-send-overlay')`)

      // 2. 思考
      send(begin('m-think')); send(block(0, 'thinking'))
      await status('正在思考'); mark('think'); rects.crab = await box('[data-composer-crab]'); rects.main = await box('main')
      await streamText(thinking, '用户想在设置页加一个深色模式开关。\n先看 Settings.tsx 现在怎么组织“外观”分组，\n再确认颜色变量是不是都集中在 theme.css。\n改完要跑测试，确认设置页快照没被破坏。', 2600)

      // 3. 读文件
      send(toolUse('read', 'Read', { file_path: join(project, 'src/settings/Settings.tsx') }))
      await status('正在读取'); mark('read')
      await sleep(1700)
      send(toolResult('read', 'export function Settings() { … }'))

      // 4. 修改文件（展开 diff）
      send(toolUse('edit', 'Edit', {
        file_path: join(project, 'src/settings/Settings.tsx'),
        old_string: '  return <Section title="外观"><FontSize /></Section>',
        new_string: '  const [dark, setDark] = useTheme()\n  return <Section title="外观">\n    <FontSize />\n    <Switch label="深色模式" checked={dark} onChange={setDark} />\n  </Section>'
      }))
      await status('正在写入或修改'); mark('write')
      await sleep(1900)
      send(toolResult('edit', '已更新'))

      // 5. 请求确认运行命令
      send(toolUse('bash', 'Bash', { command: 'npm test -- settings', description: '运行设置页测试' }))
      win.webContents.send('chat:onEvent', sessionId, { kind: 'approval', request: { requestId: 'r1', toolName: 'Bash', input: { command: 'npm test -- settings', description: '运行设置页测试' }, canAlwaysAllow: true } })
      setState('awaiting')
      await status('等你确认后继续'); mark('wait'); rects.composer = await composerBox()
      await sleep(2300)
      win.webContents.send('chat:onEvent', sessionId, { kind: 'approvalDone', requestId: 'r1' }); setState('running')

      // 6. 运行命令
      send({ type: 'tool_progress', tool_use_id: 'bash', tool_name: 'Bash' })
      await status('正在运行命令'); mark('bash')
      await sleep(1900)
      send(toolResult('bash', ' ✓ src/settings/Settings.test.tsx (12 tests)\n Test Files  1 passed\n      Tests  12 passed'))

      // 7. 回复并结束
      send(begin('m-answer')); send(block(0, 'text'))
      mark('answer')
      await streamText(textDelta, '已在设置页“外观”分组加入**深色模式**开关，状态通过 `useTheme` 保存。\n\n设置页相关的 12 项测试全部通过。', 1800)
      activity.finish(); flush(); setState('idle')
      await sleep(600)

      // 8. 上下文占用
      await wait(`!!document.querySelector('[aria-label="上下文占用"]')`)
      await sleep(500)
      hover(await box('[aria-label="上下文占用"]'))
      await wait(`document.querySelector('[aria-label="上下文占用"]').getAttribute('aria-expanded')==='true'`)
      await sleep(250); mark('context')
      rects.context = await rect(`(()=>{const root=document.querySelector('[aria-label="上下文占用"]').parentElement;let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;for(const e of [root,...root.querySelectorAll('*')]){const x=e.getBoundingClientRect();if(!x.width||!x.height)continue;l=Math.min(l,x.left);t=Math.min(t,x.top);r=Math.max(r,x.right);b=Math.max(b,x.bottom)}return {x:l,y:t,width:r-l,height:b-t}})()`)
      await sleep(2200)
      win.webContents.sendInputEvent({ type: 'mouseMove', x: 700, y: 300 })

      // 11. 新一轮工作中展示几种螃蟹动作
      await sleep(400)
      activity.start(); send(begin('m-more')); send(block(0, 'thinking')); setState('running')
      for (const gesture of SHOWCASE) {
        // 进入 idle 时组件调用 nextVerb() 从完整列表随机取词，固定 Math.random 即可选中目标动作
        const index = SPINNER_VERBS.findIndex(verb => CRAB_GESTURES[verb] === gesture)
        await js(`window.__random=Math.random;Math.random=()=>${(index + 0.5) / SPINNER_VERBS.length};void 0`)
        setState('idle'); await sleep(60); setState('running')
        await wait(`document.querySelector('[data-crab-pose]')?.dataset.crabGesture===${JSON.stringify(gesture)}`)
        await js(`Math.random=window.__random;void 0`)
        mark('gesture-' + gesture)
        await sleep(1500)
      }
      rects.crabShow = await composerBox()
      send(begin('m-done')); send(block(0, 'text')); send(textDelta('好了。'))
      activity.finish(); flush(); setState('idle')

      // 12. 空闲后缓存倒计时快进到 0，螃蟹在 30 秒空闲时睡着
      await sleep(27400)
      mark('cache')
      const last = transcript.messages.findLast(m => m.role === 'assistant' && !m.parentToolUseId && m.usage)
      for (const left of [4, 3, 2, 1, 0]) {
        await sleep(450)
        last.time = Date.now() - 5 * 60000 + left * 60000 - 1000
        win.webContents.send('chat:onEvent', sessionId, { kind: 'upsert', messages: [structuredClone(last)] })
      }
      await wait(`document.querySelector('[data-cache-badge]')?.textContent==='0m'`)
      await pose('sleep', 5000)
      mark('sleep')
      await sleep(400)

      // 13. 镜头移到左下角额度（运镜在 assemble.cjs 里做，这里只留时间）
      rects.quota = await box('[aria-label="剩余额度"]')
      await js(`(()=>{const s=document.createElement('style');s.textContent='[data-quota-ring],[data-quota-fill]{transition-duration:.08s!important;transition-timing-function:linear!important}';document.head.appendChild(s)})()`)
      mark('pan')
      await sleep(1050)

      // 14. 额度延时：外圈 5 小时额度一圈圈烧完 → 入夜 → 天亮回满；周额度每轮少一截，最后烧尽
      mark('quota')
      const WEEKS = [75, 50, 25, 0]
      for (let cycle = 0; cycle < 3; cycle++) {
        const steps = 22
        for (let i = 1; i <= steps; i++) {
          await setQuota(Math.round(100 * (1 - i / steps)), Math.round(WEEKS[cycle] + (WEEKS[cycle + 1] - WEEKS[cycle]) * i / steps))
          await sleep(1100 / steps)
        }
        mark('night-' + cycle)
        await sky('#2a3766', 0.78, 260)
        await sleep(cycle < 2 ? 380 : 560)
        if (cycle === 2) break
        await setQuota(100, WEEKS[cycle + 1])
        await sky('#ffc89a', 0.45, 220)
        await sleep(200)
        mark('dawn-' + cycle)
        await sky('#ffc89a', 0, 260)
        await sleep(160)
      }
      mark('quotaEnd')

      recording = false
      await dbg.sendCommand('Page.stopScreencast')
      const viewport = await js(`({width:innerWidth,height:innerHeight})`)
      writeFileSync(join(RAW, 'timeline.json'), JSON.stringify({ viewport, frames, marks, rects }, null, 1))
      console.log(`✓ 录制 ${frames.length} 帧，${(frames.at(-1).t - frames[0].t).toFixed(1)} 秒 → ${RAW}`)
      clearTimeout(timeout); app.quit()
    } catch (error) {
      console.error(error)
      writeFileSync(join(RAW, 'failure.png'), (await win.capturePage()).toPNG())
      clearTimeout(timeout); app.exit(1)
    }
  })
})
require(resolve('out/main/index.js'))
