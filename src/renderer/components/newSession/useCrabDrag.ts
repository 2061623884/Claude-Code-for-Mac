// 新建会话页的小螃蟹可以被拖起来：夹住时换表情、蹬腿；松手后掉回输入框上方（水平位置就近，超出范围收回来）。
// 拖动期间改为 position: fixed，避免被页面容器裁掉；落地后回到原来的布局里，只保留水平偏移。
// 发起会话时的飞行动画会实时测量螃蟹的位置，所以停在哪里都能从那里飞走。
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { CRAB_FACES, type CrabFace } from './Crab'

const CRAB_WIDTH = 78
/** 移动超过这个距离才算拖动，避免误触 */
const THRESHOLD = 3

function reduced(): boolean {
  return typeof Element.prototype.animate !== 'function' || document.documentElement.dataset.reduceMotion === 'true' || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

export function useCrabDrag(enabled: boolean) {
  const slot = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [face, setFace] = useState<CrabFace>()
  const rest = useRef(0)
  const drag = useRef<{ id: number; x: number; y: number; held: boolean; dx: number; dy: number } | null>(null)
  const landing = useRef<Animation | null>(null)
  const lastFace = useRef<CrabFace | undefined>(undefined)

  const maxX = (): number => Math.max(0, (slot.current?.parentElement?.parentElement?.clientWidth ?? CRAB_WIDTH) - CRAB_WIDTH)
  const settle = useCallback((x: number): void => {
    const el = body.current
    if (!el) return
    Object.assign(el.style, { position: '', left: '', top: '', zIndex: '', transform: x ? `translateX(${x}px)` : '' })
    rest.current = x
  }, [])

  // 窗口变窄时把螃蟹收回输入框范围内
  useEffect(() => {
    if (!enabled) return
    const clamp = (): void => { if (!drag.current?.held && rest.current > maxX()) settle(maxX()) }
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [enabled, settle])

  useEffect(() => () => landing.current?.cancel(), [])

  const lift = (): void => {
    const el = body.current, home = slot.current
    if (!el || !home) return
    const anchor = home.getBoundingClientRect()
    Object.assign(el.style, { position: 'fixed', left: `${anchor.left}px`, top: `${anchor.top}px`, zIndex: '60', transform: `translate(${rest.current}px, 0px)` })
    // 祖先元素带 transform 时 fixed 不以视口为准，按实际偏差校正一次
    const actual = el.getBoundingClientRect()
    const errorX = actual.left - (anchor.left + rest.current), errorY = actual.top - anchor.top
    if (errorX || errorY) Object.assign(el.style, { left: `${anchor.left - errorX}px`, top: `${anchor.top - errorY}px` })
    const choices = CRAB_FACES.filter(f => f !== lastFace.current)
    const next = choices[Math.floor(Math.random() * choices.length)]!
    lastFace.current = next
    setFace(next)
  }

  const drop = (dx: number, dy: number): void => {
    const el = body.current
    if (!el) return
    const from = rest.current + dx
    const to = Math.min(Math.max(from, 0), maxX())
    const finish = (): void => {
      landing.current = null
      settle(to)
      setFace(undefined)
      const crab = el.querySelector('.crab')
      if (crab && !reduced()) crab.animate([{ transform: 'scale(1.06, .88)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' })
    }
    if (reduced()) { finish(); return }
    // 在上方就像自由落体一样加速下落；被拖到下面就轻轻弹回去
    const falling = dy < 0
    const duration = falling ? Math.min(650, Math.max(220, Math.sqrt(-dy) * 26)) : 260
    landing.current = el.animate(
      [{ transform: `translate(${from}px, ${dy}px)` }, { transform: `translate(${to}px, 0px)` }],
      { duration, easing: falling ? 'cubic-bezier(.5, 0, .95, .55)' : 'cubic-bezier(.2, .8, .3, 1)' }
    )
    landing.current.onfinish = finish
    landing.current.oncancel = () => { landing.current = null }
    el.style.transform = `translate(${to}px, 0px)`
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    // 掉落途中（最多 0.65 秒）不接受抓取
    if (!enabled || e.button !== 0 || drag.current || landing.current) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, held: false, dx: 0, dy: 0 }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    d.dx = e.clientX - d.x
    d.dy = e.clientY - d.y
    if (!d.held) {
      if (Math.hypot(d.dx, d.dy) < THRESHOLD) return
      d.held = true
      lift()
    }
    body.current!.style.transform = `translate(${rest.current + d.dx}px, ${d.dy}px)`
  }
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (d.held) drop(d.dx, d.dy)
  }

  return {
    face,
    slotRef: slot,
    bodyRef: body,
    handlers: enabled ? { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd } : {}
  }
}
