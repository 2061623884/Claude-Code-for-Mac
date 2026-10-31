// Synthetic task/session fixtures; real organization persistence, artifact dialogs and file preview.
const { app, ipcMain, dialog, nativeTheme } = require('electron')
const fs = require('node:fs'),
  { join, resolve } = require('node:path'),
  { tmpdir } = require('node:os')
const { buildSync } = require('esbuild')
const scratch = fs.mkdtempSync(join(tmpdir(), 'claude-incremental-')),
  userdata = join(scratch, 'userdata'),
  p = join(scratch, 'p'),
  q = join(scratch, 'q')
for (const dir of [userdata, p, q]) fs.mkdirSync(dir)
const report = join(p, 'report.md'),
  other = join(q, 'other.md'),
  manual = join(p, 'manual.txt'),
  exported = join(scratch, 'export.md')
fs.writeFileSync(report, '# 本地产物验证\n\n来自可靠的文件操作。')
fs.writeFileSync(other, '# 另一个项目')
fs.writeFileSync(manual, '手动产物')
const organization = {
  revision: 1,
  pinned: ['a'],
  sections: [{ id: 'client', title: '客户项目', collapsed: false, sessions: ['a', 'b'] }],
  attention: { b: { completed: 'completed-b' } }
}
fs.writeFileSync(
  join(userdata, 'claude-desk.json'),
  JSON.stringify({
    version: 1,
    projects: [
      { id: 'p', name: 'Project P', path: p, addedAt: 0, collapsed: false },
      { id: 'q', name: 'Project Q', path: q, addedAt: 0, collapsed: false }
    ],
    archived: {},
    settings: { theme: 'light' },
    seededFromHistory: true,
    organization
  })
)
fs.writeFileSync(
  join(userdata, 'artifacts.json'),
  JSON.stringify({
    version: 1,
    revision: 1,
    excluded: [],
    items: [
      {
        id: 'report',
        path: report,
        name: 'report.md',
        type: 'md',
        sources: [
          { sessionId: 'a', cwd: p, evidence: 'file-tool' },
          { sessionId: 'b', cwd: q, evidence: 'manual' }
        ]
      },
      {
        id: 'other',
        path: other,
        name: 'other.md',
        type: 'md',
        sources: [{ sessionId: 'b', cwd: q, evidence: 'file-tool' }]
      }
    ]
  })
)
process.env.CLAUDE_DESK_USERDATA = userdata
buildSync({
  entryPoints: [resolve('src/main/sessionActivity.ts')],
  outfile: join(scratch, 'activity.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs'
})
const { SessionActivity } = require(join(scratch, 'activity.cjs')),
  collector = new SessionActivity(p)
collector.beginProcess()
const call = (id, name, input) =>
  collector.apply({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } })
const result = (id, output) =>
  collector.apply({
    type: 'user',
    tool_use_result: output,
    message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'OK' }] }
  })
call('todo', 'TodoWrite', { todos: [{ content: '普通待办', status: 'pending' }] })
result('todo', {})
call('agent', 'Agent', { description: '验证子任务', subagent_type: 'Explore' })
collector.apply({
  type: 'system',
  subtype: 'task_started',
  task_id: 'child',
  tool_use_id: 'agent',
  run_id: '2',
  task_type: 'local_agent',
  description: '验证子任务'
})
collector.apply({
  type: 'system',
  subtype: 'task_started',
  task_id: 'shell',
  run_id: '1',
  task_type: 'local_bash',
  description: '后台构建'
})
let approvals = [],
  state = 'idle',
  stopped = [],
  win
const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (name, handler) => {
  const stubs = {
    'sessions:list': (_e, cwd) => [
      { id: cwd === p ? 'a' : 'b', title: cwd === p ? '会话 A' : '会话 B', cwd, lastModified: 0, archived: false }
    ],
    'chat:open': (_e, id) => ({
      messages: [
        { id: 'hello', role: 'assistant', parentToolUseId: null, blocks: [{ kind: 'text', text: '这是会话 ' + id }] }
      ],
      state: id === 'b' ? state : 'idle',
      approvals: id === 'b' ? approvals : [],
      live: true,
      summary: id === 'a' ? collector.snapshot() : new SessionActivity(q).snapshot()
    }),
    'chat:context': () => ({ used: 100, max: 1000, percent: 10, parts: [{ name: 'messages', tokens: 100 }] }),
    'chat:mcp': () => [{ name: 'Fixture MCP', status: 'connected', tools: 2 }],
    'chat:checkExternal': () => false,
    'meta:get': () => ({ models: [], subscriptionType: null, claudeVersion: 'fixture' }),
    'meta:commands': (_e, cwd) => ({ cwd, revision: 1, commands: [], status: 'ready', updatedAt: 0 }),
    'meta:usage': () => ({ available: false, windows: [], subscriptionType: null }),
    'artifacts:collect': () => {},
    'tasks:output': (_e, id, cwd, record) => ({
      messages: [
        {
          id: 'output',
          role: 'assistant',
          parentToolUseId: null,
          blocks: [
            { kind: 'text', text: '子任务完整输出 fixture' },
            {
              kind: 'tool',
              id: 'read',
              name: 'Read',
              input: { file_path: report },
              result: { text: 'Output contents', isError: false }
            }
          ]
        }
      ],
      truncated: false
    }),
    'tasks:stop': (_e, id, record, run) => {
      const item = collector.taskRecord(record)
      if (id !== 'a' || !item || !collector.canStop(item) || item.execution.runId !== run)
        throw Error('Invalid task target')
      stopped.push(record)
      collector.apply({
        type: 'system',
        subtype: 'task_notification',
        task_id: item.execution.taskId,
        run_id: run,
        status: 'stopped'
      })
      win.webContents.send('chat:event', 'a', { kind: 'summary', summary: collector.snapshot() })
    }
  }
  originalHandle(name, stubs[name] || handler)
}
dialog.showOpenDialog = async (_win, options) => ({
  canceled: false,
  filePaths: [options.title === '重新定位产物' ? report : manual]
})
dialog.showSaveDialog = async () => ({ canceled: false, filePath: exported })
const output = resolve('dist/build-check')
fs.mkdirSync(output, { recursive: true })
const timeout = setTimeout(() => {
  console.error('Incremental smoke timeout')
  app.exit(1)
}, 60000)
app.on('browser-window-created', (_event, window) => {
  win = window
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_r, cb) =>
    cb({ cancel: true })
  )
  win.webContents.once('did-finish-load', async () => {
    const js = (c) => win.webContents.executeJavaScript(c, true)
    const wait = async (c) => {
      for (let i = 0; i < 100; i++) {
        if (await js(c)) return
        await new Promise((r) => setTimeout(r, 60))
      }
      throw Error('Failed: ' + c)
    }
    const click = async (text) => {
      await wait(
        `!![...document.querySelectorAll('button')].find(b=>b.offsetParent&&(b.getAttribute('aria-label')===${JSON.stringify(text)}||b.textContent.trim()===${JSON.stringify(text)}))`
      )
      await js(
        `([...document.querySelectorAll('button')].find(b=>b.offsetParent&&(b.getAttribute('aria-label')===${JSON.stringify(text)}||b.textContent.trim()===${JSON.stringify(text)}))).click()`
      )
    }
    const open = async (id) => {
      await js(`document.querySelector('[data-session-row="${id}"] [role="button"]').click()`)
      await wait(`document.querySelector('main')?.innerText.includes('这是会话 ${id}')`)
    }
    const shot = async (name) => {
      await new Promise((r) => setTimeout(r, 250))
      fs.writeFileSync(join(output, name + '.png'), (await win.capturePage()).toPNG())
    }
    try {
      await wait(`document.querySelectorAll('[data-session-row="a"]').length===1`)
      await wait(`!!document.querySelector('[aria-label="置顶"] [data-session-row="a"]')`)
      await js(`document.querySelector('[data-session-row="a"] [role="button"]').focus()`)
      await click('整理会话 会话 A')
      await click('取消置顶')
      await wait(`!!document.querySelector('[aria-label="分区 客户项目"] [data-session-row="a"]')`)
      if (await js(`document.querySelectorAll('[data-session-row="a"]').length!==1`)) throw Error('Pinned duplicate')
      await wait(`!!document.querySelector('[data-session-row="b"] [aria-label="完成后未读"]')`)
      await open('b')
      win.show()
      win.focus()
      await wait(`!document.querySelector('[data-session-row="b"] [aria-label="完成后未读"]')`)
      await open('a')
      approvals = [
        { requestId: 'permission', toolName: 'Bash', input: { command: 'echo fixture' }, canAlwaysAllow: false }
      ]
      state = 'awaiting'
      win.webContents.send('chat:event', 'b', { kind: 'approval', request: approvals[0] })
      win.webContents.send('chat:event', 'b', { kind: 'state', state })
      await wait(`!!document.querySelector('[data-session-row="b"] [aria-label="待确认"]')`)
      await open('b')
      await wait(`!!document.querySelector('[data-session-row="b"] [aria-label="待确认"]')`)
      approvals = []
      state = 'idle'
      win.webContents.send('chat:event', 'b', { kind: 'approvalDone', requestId: 'permission' })
      win.webContents.send('chat:event', 'b', { kind: 'state', state })
      await wait(`!document.querySelector('[data-session-row="b"] [aria-label="待确认"]')`)
      await open('a')
      await click('切换摘要面板状态')
      await click('子 Agent分类')
      await click('查看验证子任务输出')
      await wait(`document.querySelector('[aria-label="会话摘要详情"]')?.innerText.includes('子任务完整输出 fixture')`)
      await click('← 返回会话摘要')
      await click('查看全部')
      await wait(`!!document.querySelector('[aria-label="会话摘要详情"]')`)
      if (await js(`document.querySelectorAll('[aria-label="查看全部"]').length!==1`)) throw Error('Duplicate view-all')
      await click('› 会话信息')
      await wait(`document.querySelector('[aria-label="会话摘要详情"]').innerText.includes('Fixture MCP')`)
      await click('⌄ 会话信息')
      await wait(`!!document.querySelector('[data-task-actions="agent"]')`)
      await js(
        `([...document.querySelectorAll('[data-task-actions="agent"] button')].find(b=>b.textContent==='查看输出')).click()`
      )
      await wait(`document.querySelector('[aria-label="会话摘要详情"]').innerText.includes('子任务完整输出 fixture')`)
      await click('← 返回会话摘要')
      await js(
        `([...document.querySelectorAll('[data-task-actions="execution:shell"] button')].find(b=>b.textContent==='停止任务')).click()`
      )
      await wait(
        `document.querySelector('[data-task-actions="execution:shell"]')?.innerText.includes('停止任务')===false`
      )
      if (stopped.join(',') !== 'execution:shell' || !collector.snapshot().sections.agents[0].execution.canStop)
        throw Error('Wrong task stopped')
      await click('手动加入')
      await click('› 本地产物 · 2')
      await wait(`document.querySelector('[aria-label="会话摘要详情"]').innerText.includes('manual.txt')`)
      await wait(`document.querySelector('aside[aria-label="工作区侧栏"]')?.getBoundingClientRect().width>300`)
      await shot('incremental-details')
      await click('产物')
      await wait(`document.querySelector('main').innerText.includes('report.md')`)
      if (await js(`!!document.querySelector('aside[aria-label="工作区侧栏"]')`))
        throw Error('Global library opened session sidebar')
      await click('report.md')
      await wait(`document.querySelector('main').innerText.includes('本地产物验证')`)
      const count = await js(`document.querySelectorAll('article').length`)
      if (count !== 3) throw Error('Artifact duplicate or missing')
      await js(
        `([...document.querySelectorAll('article')].find(a=>a.innerText.includes('report.md')).querySelector('button:nth-of-type(1)')).click()`
      )
      await js(
        `([...document.querySelectorAll('article')].find(a=>a.innerText.includes('report.md'))).querySelectorAll('button').forEach(b=>{if(b.textContent==='另存副本')b.click()})`
      )
      for (let i = 0; i < 100 && !fs.existsSync(exported); i++) await new Promise((r) => setTimeout(r, 50))
      if (fs.readFileSync(exported, 'utf8') !== fs.readFileSync(report, 'utf8')) throw Error('Export differs')
      const select = async (label, value) => js(`(()=>{const s=document.querySelector('select[aria-label="${label}"]');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
      await select('按项目筛选产物', p)
      await wait(`document.querySelectorAll('article').length===2`)
      await select('按来源会话筛选产物', 'a')
      await select('按文件类型筛选产物', 'txt')
      await wait(`document.querySelectorAll('article').length===1 && document.querySelector('article').innerText.includes('manual.txt')`)
      await select('按项目筛选产物', '')
      await select('按文件类型筛选产物', '')
      await wait(`document.querySelectorAll('article').length===3`)
      await shot('incremental-artifacts-light')
      nativeTheme.themeSource = 'dark'
      await new Promise((r) => setTimeout(r, 150))
      await shot('incremental-artifacts-dark')
      const saved = JSON.parse(fs.readFileSync(join(userdata, 'claude-desk.json'), 'utf8'))
      if (
        saved.organization.pinned.length ||
        saved.organization.sections[0].sessions.join(',') !== 'a,b' ||
        saved.organization.attention.b.read !== 'completed-b'
      )
        throw Error('Organization persistence failed')
      console.log(
        'PASS: unique pins/restored sections; orange unread vs approvals; existing details/info; task output and isolated stop; real artifact indexing/manual add/export/preview; light/dark'
      )
      clearTimeout(timeout)
      app.quit()
    } catch (error) {
      console.error(error)
      await shot('incremental-failure')
      clearTimeout(timeout)
      app.exit(1)
    }
  })
})
require(process.env.CLAUDE_DESK_SMOKE_ENTRY || '../out/main/index.js')
