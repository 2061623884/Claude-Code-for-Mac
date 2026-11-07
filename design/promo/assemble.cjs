// 把 record.cjs 的录屏按分镜剪成 30 秒成片：开屏 + 中段特写与字幕 + 片尾
// 用法：env -u ELECTRON_RUN_AS_NODE npx electron design/promo/assemble.cjs（需先运行 record.cjs 和 render.cjs）
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const OUT = path.join(__dirname, 'out'), RAW = path.join(OUT, 'raw'), WORK = path.join(OUT, 'work')
const FPS = 60, W = 1920, H = 1080
const ff = args => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' })
const ENCODE = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '14', '-preset', 'slow', '-r', String(FPS)]

const timeline = JSON.parse(fs.readFileSync(path.join(RAW, 'timeline.json'), 'utf8'))
const { viewport, frames, marks, rects } = timeline
const t0 = frames[0].t
const at = name => marks[name] - t0
const [frameW] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'csv=p=0', path.join(RAW, 'frames', frames[0].file)]).toString().trim().split(',').map(Number)
const scale = frameW / viewport.width

/** 以 (cx, cy) 为中心、宽 w 的 16:9 取景框（CSS 像素），贴边时向内收 */
function frame(cx, cy, w) {
  w = Math.min(w, viewport.width, viewport.height * 16 / 9)
  const h = w * 9 / 16
  const x = Math.min(Math.max(cx - w / 2, 0), viewport.width - w), y = Math.min(Math.max(cy - h / 2, 0), viewport.height - h)
  const px = v => Math.round(v * scale / 2) * 2
  return `crop=${px(w)}:${px(h)}:${px(x)}:${px(y)}`
}
const center = (r, dx = 0, dy = 0) => [r.x + r.width / 2 + dx, r.y + r.height / 2 + dy]
const crab = r => frame(r.x + 170, r.y + 12, 520)

// [起点秒, 源时长, 成片时长, 取景, 字幕]
const SHOTS = [
  [at('send') - 2.3, 3.0, 3.0, frame(viewport.width / 2, viewport.height / 2, viewport.width), '一句话，开始工作'],
  ...['thinking', 'exploring', 'cooking', 'making', 'growing'].map(g => [at('gesture-' + g) + 0.15, 1.1, 1.1, crab(rects.crabShow), '干活时，它总有点小动作']),
  [at('wait') + 0.3, 1.3, 1.3, crab(rects.crab), '要你拍板时，它会停下来等'],
  [at('sleep') + 0.2, 1.2, 1.2, crab(rects.crabSleep), '做完了，它歇会儿'],
  [at('think'), at('wait') + 1.2 - at('think'), 6.0, frame(894, 310, 900), '每一步都摊开给你看'],
  [at('context') + 0.1, 2.0, 2.0, frame(...center(rects.context), 760), '上下文、额度、用量，一眼看清'],
  [at('quota') + 0.1, 2.0, 2.0, frame(rects.quota.x + 150, rects.quota.y + 18, 400), '上下文、额度、用量，一眼看清'],
  [at('usage') + 0.1, 2.0, 2.0, frame(...center(rects.usage), rects.usage.width * 1.06), '上下文、额度、用量，一眼看清']
]

const CAPTION = text => `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden}
  div{position:absolute;left:50%;bottom:72px;transform:translateX(-50%);white-space:nowrap;padding:18px 40px;border-radius:999px;
    background:rgba(31,30,29,.84);color:#fff;font:500 46px/1.25 -apple-system,"PingFang SC",sans-serif;letter-spacing:.06em}
</style><div>${text}</div>`

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  fs.rmSync(WORK, { recursive: true, force: true }); fs.mkdirSync(WORK, { recursive: true })

  // 1. 录屏帧按真实时间戳拼成恒定 60fps 的母带
  const list = frames.map((f, i) => `file '${path.join(RAW, 'frames', f.file)}'\nduration ${((frames[i + 1]?.t ?? f.t + 1 / FPS) - f.t).toFixed(4)}`)
  fs.writeFileSync(path.join(WORK, 'frames.txt'), list.join('\n') + `\nfile '${path.join(RAW, 'frames', frames.at(-1).file)}'\n`)
  ff(['-f', 'concat', '-safe', '0', '-i', path.join(WORK, 'frames.txt'), '-vf', `fps=${FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '10', '-preset', 'fast', path.join(WORK, 'master.mp4')])

  // 2. 字幕渲染成透明 PNG
  const win = new BrowserWindow({ width: W, height: H, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } })
  const captions = new Map()
  for (const text of new Set(SHOTS.map(s => s[4]))) {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(CAPTION(text)))
    await win.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))')
    let image = await win.webContents.capturePage()
    if (image.getSize().width !== W) image = image.resize({ width: W, height: H, quality: 'best' })
    const file = path.join(WORK, `caption-${captions.size}.png`)
    fs.writeFileSync(file, image.toPNG()); captions.set(text, file)
  }
  win.destroy()

  // 3. 逐个镜头：取景放大 → 变速 → 叠字幕
  const parts = [path.join(OUT, 'intro-16x9.mp4')]
  SHOTS.forEach(([start, source, duration, crop, text], i) => {
    const file = path.join(WORK, `shot-${String(i).padStart(2, '0')}.mp4`)
    ff(['-ss', start.toFixed(3), '-t', source.toFixed(3), '-i', path.join(WORK, 'master.mp4'), '-i', captions.get(text),
      '-filter_complex', `[0:v]${crop},scale=${W}:${H}:flags=lanczos,setpts=(PTS-STARTPTS)*${(duration / source).toFixed(4)},fps=${FPS}[v];[v][1:v]overlay=0:0[out]`,
      '-map', '[out]', '-t', duration.toFixed(3), ...ENCODE, file])
    parts.push(file)
  })
  parts.push(path.join(OUT, 'outro-16x9.mp4'))

  // 4. 拼接成片
  const final = path.join(OUT, 'promo-16x9.mp4')
  ff([...parts.flatMap(p => ['-i', p]), '-filter_complex', parts.map((_, i) => `[${i}:v]setsar=1,fps=${FPS}[v${i}]`).join(';') + ';' + parts.map((_, i) => `[v${i}]`).join('') + `concat=n=${parts.length}:v=1:a=0[out]`,
    '-map', '[out]', ...ENCODE, '-movflags', '+faststart', final])
  const seconds = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final]).toString().trim()
  console.log(`✓ ${path.relative(process.cwd(), final)}  ${Number(seconds).toFixed(2)} 秒`)
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
