// 宣传片共用：Spark 几何与缓动。光芒数据与 src/renderer/motion/splash.ts 一致
const RAYS = [
  [-179.2, 11.59, 7, 1.38, -0.26, 10.39, 1.44, -0.11],
  [-143.6, 11.83, 7, 2.23, -0.05, 10.63, 2.37, -0.05],
  [-114.6, 12.93, 7, 2.49, 0.34, 11.73, 2.79, 0.19],
  [-76.7, 11.82, 7, 1.83, 0.31, 10.62, 2.00, 0.01],
  [-46.0, 12.53, 7, 2.97, 0.56, 11.33, 2.62, 0.18],
  [-8.6, 12.43, 7, 1.86, 0.31, 11.23, 1.72, 0.10],
  [11.8, 12.67, 7, 1.45, 0.41, 11.47, 2.10, 0.21],
  [43.8, 12.66, 7, 1.45, -0.65, 11.46, 1.18, -0.88],
  [53.7, 12.14, 7, 2.01, 0.35, 10.94, 1.96, 0.51],
  [90.8, 12.08, 7, 1.58, -0.55, 10.88, 2.02, -0.02],
  [121.0, 11.75, 7, 1.59, -0.72, 10.55, 1.49, -0.23],
  [144.5, 11.06, 7, 1.81, -0.29, 9.86, 1.82, -0.16]
]
const CORE_R = 2.1, ROOT = 0.8, KEEP = 2.4, EXTENT = 26.4

const f3 = v => +v.toFixed(3)
const clamp01 = x => Math.min(1, Math.max(0, x))
const lerp = (a, b, t) => a + (b - a) * t
const outCubic = t => 1 - (1 - t) ** 3
const outBack = t => 1 + 2.9 * (t - 1) ** 3 + 1.9 * (t - 1) ** 2
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const pulse = phase => Math.sin(Math.PI * (phase - Math.floor(phase))) ** 0.6

function rayD([deg, len, a1, w1, o1, a2, w2, o2], k) {
  const ax = deg * Math.PI / 180, c = Math.cos(ax), s = Math.sin(ax)
  const lerpAt = (v1, v2, a) => v1 + (v2 - v1) * (a - a1) / (a2 - a1)
  const reach = KEEP + (len - KEEP) * k
  const rt = w2 / 2
  const tip = Math.max(reach - rt, ROOT)
  const off = a => lerpAt(o1, o2, Math.min(a, a2))
  const w0 = Math.max(lerpAt(w1, w2, ROOT), w1 * 0.6), r0 = w0 / 2
  const pt = (a, o) => `${f3(a * c - o * s)} ${f3(a * s + o * c)}`
  return `M${pt(ROOT, off(ROOT) - r0)}L${pt(tip, off(tip) - rt)}A${f3(rt)} ${f3(rt)} 0 0 1 ${pt(tip, off(tip) + rt)}`
    + `L${pt(ROOT, off(ROOT) + r0)}A${f3(r0)} ${f3(r0)} 0 0 1 ${pt(ROOT, off(ROOT) - r0)}Z`
}

/** k：光芒伸出比例，0 = 圆点，1 = 完整 logo */
function sparkD(k) {
  const r = CORE_R + 1.3 * (1 - k)
  let d = `M${f3(r)} 0A${f3(r)} ${f3(r)} 0 1 1 ${f3(-r)} 0A${f3(r)} ${f3(r)} 0 1 1 ${f3(r)} 0Z`
  for (const ray of RAYS) d += rayD(ray, k)
  return d
}

/**
 * 确定性播放：页面实现 render(t)。
 * ?at=毫秒 定格单帧；默认实时循环播放（空格或点击重播）；导出脚本直接调用 window.render。
 */
function mountTimeline(render, duration) {
  window.render = render
  window.DURATION = duration
  const at = new URLSearchParams(location.search).get('at')
  if (window.__RENDERING__) return
  if (at !== null) { render(Number(at)); return }
  let t0 = performance.now(), raf
  const loop = now => { render(Math.min(now - t0, duration)); raf = requestAnimationFrame(loop) }
  const restart = () => { cancelAnimationFrame(raf); t0 = performance.now(); raf = requestAnimationFrame(loop) }
  addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'r') { e.preventDefault(); restart() } })
  addEventListener('pointerdown', restart)
  restart()
}
