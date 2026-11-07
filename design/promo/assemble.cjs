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

/** 以 (cx, cy) 为中心、宽 w 的 16:9 取景框，贴边时向内收；返回母带像素坐标 */
function box(cx, cy, w) {
  w = Math.min(w, viewport.width, viewport.height * 16 / 9)
  const h = w * 9 / 16
  const x = Math.min(Math.max(cx - w / 2, 0), viewport.width - w), y = Math.min(Math.max(cy - h / 2, 0), viewport.height - h)
  const px = v => Math.round(v * scale / 2) * 2
  return { x: px(x), y: px(y), w: px(w), h: px(h) }
}
const cropOf = b => `crop=${b.w}:${b.h}:${b.x}:${b.y},scale=${W}:${H}:flags=lanczos`
const frame = (cx, cy, w) => cropOf(box(cx, cy, w))

/**
 * 运镜：keys 为 [镜头时间秒, 取景框]，相邻关键帧之间缓入缓出。
 * 缩放走对数空间、中心随缩放比例移动，目标点在推进过程中保持稳定；逐帧缩放后再裁成 1920×1080。
 */
function camera(keys) {
  const segment = ([t0, a], [t1, b]) => {
    const p = `clip((t-${t0})/${t1 - t0},0,1)`, e = `(${p}*${p}*(3-2*${p}))`
    const width = a.w === b.w ? `${a.w}` : `(${a.w}*exp(${e}*${Math.log(b.w / a.w)}))`
    const q = a.w === b.w ? e : `((${a.w}-${width})/${a.w - b.w})`
    return { width, cx: `(${a.x + a.w / 2}+${b.x + b.w / 2 - a.x - a.w / 2}*${q})`, cy: `(${a.y + a.h / 2}+${b.y + b.h / 2 - a.y - a.h / 2}*${q})` }
  }
  const parts = keys.slice(1).map((key, i) => segment(keys[i], key))
  const pick = name => parts.slice(0, -1).reduceRight((rest, part, i) => `if(lt(t,${keys[i + 1][0]}),${part[name]},${rest})`, parts.at(-1)[name])
  const width = pick('width'), cx = pick('cx'), cy = pick('cy')
  return `scale=w='iw*${W}/${width}':h='ih*${W}/${width}':eval=frame:flags=lanczos,`
    // crop 的 iw/ih 只在初始化时取值，逐帧缩放后会过期，所以偏移直接按缩放比例 ${W}/width 计算
    + `crop=${W}:${H}:x='clip((${cx}-${width}/2)*${W}/${width},0,${masterW}*${W}/${width}-${W})':y='clip((${cy}-${width}*9/32)*${W}/${width},0,${masterH}*${W}/${width}-${H})'`
}
const center = (r, dx = 0, dy = 0) => [r.x + r.width / 2 + dx, r.y + r.height / 2 + dy]
const [masterW, masterH] = [Math.round(viewport.width * scale / 2) * 2, Math.round(viewport.height * scale / 2) * 2]
const FULL = box(viewport.width / 2, viewport.height / 2, viewport.width)

// [起点秒, 源时长, 成片时长, 取景, 字幕]
// 取景框
const CHAT = box(894, 310, 900)
const COMPOSER = box(...center(rects.composer), rects.composer.width * 1.15)
const QUOTA = box(rects.quota.x + 150, rects.quota.y + 18, 380)

// 完成后的长镜头：输入框倒计时 → 拉远 → 推到左下角额度 → 额度延时
const tail = { start: at('cache'), source: at('quotaEnd') - at('cache'), duration: 8.95 }
const k = tail.duration / tail.source, pan = (at('pan') - at('cache')) * k, quotaAt = (at('quota') - at('cache')) * k

// [起点秒, 源时长, 成片时长, 取景, 字幕]；字幕可以是 [[文字, 起, 止], …]（镜头内时间）
const SHOTS = [
  [at('send') - 2.2, 3.0, 3.0, cropOf(FULL), '说一句话，我就开始干活'],
  // 对话流结束在确认卡出现、螃蟹停下来等；最后 0.75 秒推到整个输入框
  [at('think'), at('wait') + 1.0 - at('think'), 4.75, camera([[0, CHAT], [4.0, CHAT], [4.75, COMPOSER]]), '我的每一步，都摊开给你看'],
  ...['thinking', 'exploring', 'cooking', 'making'].map(g => [at('gesture-' + g) + 0.15, 0.95, 0.95, cropOf(COMPOSER), '干活时，我总有点小动作']),
  [tail.start, tail.source, tail.duration, camera([[0, COMPOSER], [pan, COMPOSER], [pan + 0.4, FULL], [pan + 1.0, QUOTA]]),
    [['做完了，缓存慢慢凉了，我也歇会儿', 0, pan + 0.2], ['我还能干多久：外圈 5 小时，里面一周', quotaAt, tail.duration]]],
  [at('context') + 0.1, 2.5, 2.5, frame(...center(rects.context), 760), '我的上下文用了多少，一目了然']
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
  for (const text of new Set(SHOTS.flatMap(s => typeof s[4] === 'string' ? [s[4]] : s[4].map(c => c[0])))) {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(CAPTION(text)))
    await win.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))')
    let image = await win.webContents.capturePage()
    if (image.getSize().width !== W) image = image.resize({ width: W, height: H, quality: 'best' })
    const file = path.join(WORK, `caption-${captions.size}.png`)
    fs.writeFileSync(file, image.toPNG()); captions.set(text, file)
  }
  win.destroy()

  // 2.5 开屏炸开后露出的画面换成第一个镜头的首帧，开屏落定即无缝接上录屏
  const still = path.join(WORK, 'first-frame.png')
  ff(['-ss', SHOTS[0][0].toFixed(3), '-i', path.join(WORK, 'master.mp4'), '-frames:v', '1', '-vf', cropOf(FULL), still])
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  execFileSync(process.execPath, [path.join(__dirname, 'render.cjs'), 'intro', `--shot=${still}`], { env, stdio: 'inherit' })

  // 3. 逐个镜头：取景放大 → 变速 → 叠字幕
  const parts = [path.join(OUT, 'intro-16x9.mp4')]
  SHOTS.forEach(([start, source, duration, crop, text], i) => {
    const file = path.join(WORK, `shot-${String(i).padStart(2, '0')}.mp4`)
    const cues = typeof text === 'string' ? [[text, 0, duration]] : text
    const overlays = cues.map(([caption, from, to], j) => `[${j ? 'c' + j : 'v'}][${j + 1}:v]overlay=0:0:enable='between(t,${from.toFixed(3)},${to.toFixed(3)})'[${j === cues.length - 1 ? 'out' : 'c' + (j + 1)}]`).join(';')
    ff(['-ss', start.toFixed(3), '-t', source.toFixed(3), '-i', path.join(WORK, 'master.mp4'), ...cues.flatMap(([caption]) => ['-i', captions.get(caption)]),
      '-filter_complex', `[0:v]setpts=(PTS-STARTPTS)*${(duration / source).toFixed(4)},${crop},fps=${FPS}[v];${overlays}`,
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
