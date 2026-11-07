// 生成 README 配图：界面截图取自宣传片录屏（design/promo/record.cjs 的演示数据），额度螃蟹由真实组件渲染。
// 视频特效（隐藏的额度图标、像素光标）不进配图。
// 用法：先跑 record.cjs 和 assemble.cjs，再 env -u ELECTRON_RUN_AS_NODE npx electron design/readme/shots.cjs
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { buildSync } = require('esbuild')

const ROOT = path.resolve(__dirname, '../..')
const PROMO = path.join(ROOT, 'design/promo/out')
const OUT = path.join(ROOT, 'docs/images')
// 打包产物放在项目 node_modules 下，require('react') 才能解析到项目里同一份 React
const TMP = path.join(ROOT, 'node_modules/.cache/readme-shots')
fs.mkdirSync(OUT, { recursive: true }); fs.rmSync(TMP, { recursive: true, force: true })

const { viewport, frames, marks, rects } = JSON.parse(fs.readFileSync(path.join(PROMO, 'raw/timeline.json'), 'utf8'))
const master = path.join(PROMO, 'work/master.mp4')
const at = name => marks[name] - frames[0].t
const [masterW] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'csv=p=0', master]).toString().trim().split(',').map(Number)
const k = masterW / viewport.width

/** 从录屏母带取一帧，按视口坐标裁剪（pad 为四周留白），宽度缩放到 width */
function still(name, time, r, width, pad = 0) {
  const x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad)
  const w = Math.min(viewport.width - x, r.width + pad * 2), h = Math.min(viewport.height - y, r.height + pad * 2)
  const crop = `crop=${Math.round(w * k)}:${Math.round(h * k)}:${Math.round(x * k)}:${Math.round(y * k)},scale=${width}:-2:flags=lanczos`
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', time.toFixed(3), '-i', master, '-frames:v', '1', '-vf', crop, path.join(OUT, name)])
}

// 额度螃蟹：真实 QuotaCrab 组件 + 真实文案规则
buildSync({ entryPoints: [path.join(ROOT, 'src/renderer/components/usage/QuotaCrab.tsx'), path.join(ROOT, 'src/shared/quotaFire.ts')], outdir: TMP, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react'], logLevel: 'error' })
const { QuotaCrab } = require(path.join(TMP, 'renderer/components/usage/QuotaCrab.js'))
const { quotaFireLabel } = require(path.join(TMP, 'shared/quotaFire.js'))
const STATES = [[100, 75], [15, 60], [0, 40], [70, 15], [10, 10], [50, 0]]
const quotaHtml = `<!doctype html><meta charset="utf-8"><style>
  :root { --accent: #d97757; --line-strong: #37352f21; --fg: #37352f; }
  body { margin: 0; padding: 28px 24px; background: #faf9f5; font: 15px -apple-system, "PingFang SC", sans-serif; color: #37352f; display: grid; grid-template-columns: repeat(6, 132px); gap: 8px; width: max-content; }
  figure { margin: 0; display: grid; justify-items: center; gap: 10px; }
  svg { width: 72px; height: 72px; }
  b { font-weight: 500; font-size: 17px; }
  small { color: #87867f; font-size: 13px; }
</style>${STATES.map(([five, week]) => `<figure>${renderToStaticMarkup(React.createElement(QuotaCrab, { fiveHour: five, weekly: week }))}<b>${quotaFireLabel({ available: true, fiveHour: five, weekly: week })}</b><small>5h ${five}% · 周 ${week}%</small></figure>`).join('')}`

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  // 1. 总览：Bash 确认卡出现时的完整窗口
  // record.cjs 在同一时刻另截了一张不带视频特效（侧栏额度图标未隐藏）的静态图
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', path.join(PROMO, 'raw/overview.png'), '-vf', 'scale=1600:-2:flags=lanczos', path.join(OUT, 'overview.png')])
  // 2. 缓存倒计时：输入框右上角，有缓存（橙色）与已过期（灰色）
  const c = rects.composer, badge = { x: c.x + c.width - 330, y: c.y + 36, width: 330, height: 56 }
  still('cache-warm.png', at('gesture-cooking') + 0.6, badge, 660)
  still('cache-cold.png', at('cursor') - 0.1, badge, 660)
  // 3. 上下文面板
  // 只取弹出面板，裁掉底部按钮那一行（视频里的像素光标停在那里）
  const ctx = rects.context
  still('context.png', at('context') + 0.6, { ...ctx, height: ctx.height - 46 }, 600, 14)
  // 4. 额度螃蟹各状态
  const win = new BrowserWindow({ width: 900, height: 200, show: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(quotaHtml))
  const size = await win.webContents.executeJavaScript('({width:document.body.scrollWidth,height:document.body.scrollHeight})')
  win.setContentSize(size.width, size.height)
  await new Promise(r => setTimeout(r, 300))
  fs.writeFileSync(path.join(OUT, 'quota-crab.png'), (await win.webContents.capturePage()).toPNG())
  win.destroy()
  fs.rmSync(TMP, { recursive: true, force: true })
  console.log('✓ ' + fs.readdirSync(OUT).map(f => path.join('docs/images', f)).join('\n✓ '))
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
