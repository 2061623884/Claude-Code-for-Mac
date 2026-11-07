// 离线渲染 music.html 的原创配乐，响度标准化后混入成片
// 用法：env -u ELECTRON_RUN_AS_NODE npx electron design/promo/music.cjs（需先运行 assemble.cjs）
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const OUT = path.join(__dirname, 'out')
const ff = args => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' })

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL(pathToFileURL(path.join(__dirname, 'music.html')).href)
  const base64 = await win.webContents.executeJavaScript('renderWav()')
  win.destroy()
  const raw = path.join(OUT, 'music-raw.wav'), wav = path.join(OUT, 'music.wav')
  fs.writeFileSync(raw, Buffer.from(base64, 'base64'))
  // 社交平台常用 -16 LUFS，真峰值留 1.5 dB 余量
  ff(['-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', wav])
  fs.rmSync(raw)
  const video = path.join(OUT, 'promo-16x9.mp4'), final = path.join(OUT, 'promo-16x9-music.mp4')
  ff(['-i', video, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', final])
  console.log(`✓ ${path.relative(process.cwd(), wav)}\n✓ ${path.relative(process.cwd(), final)}`)
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
