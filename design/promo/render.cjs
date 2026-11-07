// 逐帧导出宣传片片段：Electron 离屏渲染 → PNG 序列 → ffmpeg 合成 MP4
// 用法：env -u ELECTRON_RUN_AS_NODE npx electron design/promo/render.cjs [intro|outro ...] [--shot=截图路径] [--fps=60]
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const args = process.argv.slice(2).filter(a => !a.startsWith('-') && !a.endsWith('.cjs'))
const opt = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const FPS = Number(opt('fps') ?? 60)
const SHOT = opt('shot')
const PAGES = args.length ? args : ['intro', 'outro']
const SIZES = { '16x9': [1920, 1080], '9x16': [1080, 1920] }
const OUT = path.join(__dirname, 'out')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  // 同一个离屏窗口复用到底：连续新建/销毁窗口时，后续 file:// 加载会失败
  const win = new BrowserWindow({ width: 1920, height: 1080, show: false, useContentSize: true, webPreferences: { offscreen: true } })
  win.webContents.setFrameRate(FPS)
  for (const name of PAGES) {
    for (const [ratio, [width, height]] of Object.entries(SIZES)) {
      win.setContentSize(width, height)
      const url = pathToFileURL(path.join(__dirname, `${name}.html`))
      url.searchParams.set('render', '1')
      if (SHOT && name === 'intro') url.searchParams.set('shot', pathToFileURL(path.resolve(SHOT)).href)
      await win.loadURL(url.href)
      await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
      const duration = await win.webContents.executeJavaScript('window.DURATION')
      const frames = Math.round(duration / 1000 * FPS)
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `promo-${name}-`))
      for (let i = 0; i < frames; i++) {
        await win.webContents.executeJavaScript(`render(${i * 1000 / FPS}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`)
        let image = await win.webContents.capturePage()
        const size = image.getSize()
        if (size.width !== width) image = image.resize({ width, height, quality: 'best' })
        fs.writeFileSync(path.join(dir, `${String(i).padStart(4, '0')}.png`), image.toPNG())
      }
      const file = path.join(OUT, `${name}-${ratio}.mp4`)
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%04d.png'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '14', '-preset', 'slow', '-movflags', '+faststart', file])
      fs.rmSync(dir, { recursive: true, force: true })
      console.log(`✓ ${path.relative(process.cwd(), file)}  ${frames} 帧`)
    }
  }
  win.destroy()
  app.quit()
}).catch(err => { console.error(err); app.exit(1) })
