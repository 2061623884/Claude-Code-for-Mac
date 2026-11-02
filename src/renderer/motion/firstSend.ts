/** One-shot visual handoff. DOM snapshots never own message state or delay sending. */
const DURATION = 880
const EASE = 'cubic-bezier(.22,.7,.2,1)'
const VARIANTS = ['hop', 'spin', 'flip'] as const
type Variant = typeof VARIANTS[number]
let previousVariant: Variant | undefined
interface Flight {
  sessionId?: string
  shell: HTMLElement
  crab: SVGSVGElement
  boxRect: DOMRect
  crabRect: DOMRect
  overlay?: HTMLElement
  animations: Animation[]
  frame?: number
  timer?: ReturnType<typeof setTimeout>
  removeListeners?: () => void
}
let active: Flight | undefined

function reduced(): boolean {
  return document.documentElement.dataset.reduceMotion === 'true' || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}
function snapshot<T extends Element>(element: T): T {
  const copy = element.cloneNode(true) as T
  for (const node of [copy, ...copy.querySelectorAll('*')]) {
    node.removeAttribute('id')
    node.removeAttribute('autofocus')
    node.removeAttribute('contenteditable')
    node.removeAttribute('data-composer')
  }
  return copy
}
function place(element: HTMLElement, rect: DOMRect): void {
  Object.assign(element.style, { position: 'absolute', left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0' })
}
export function cancelFirstSend(): void {
  const flight = active
  active = undefined
  document.querySelectorAll('[data-first-send-target]').forEach(node => node.removeAttribute('data-first-send-target'))
  if (!flight) return
  if (flight.frame !== undefined) cancelAnimationFrame(flight.frame)
  clearTimeout(flight.timer)
  flight.removeListeners?.()
  flight.animations.forEach(animation => animation.cancel())
  flight.overlay?.remove()
}
export function isFirstSendTarget(sessionId: string): boolean { return active?.sessionId === sessionId }

/** Capture before submitting; arm only once the backend has accepted the new session. */
export function captureFirstSend(root: HTMLElement | null): { arm(id: string): void; cancel(): void; release(): void } | undefined {
  cancelFirstSend()
  if (!root || reduced() || typeof Element.prototype.animate !== 'function') return
  const box = root.querySelector<HTMLElement>('[data-composer-surface]')
  const crab = root.querySelector<SVGSVGElement>('.crab')
  if (!box || !crab) return
  const boxRect = box.getBoundingClientRect(), crabRect = crab.getBoundingClientRect()
  if (!boxRect.width || !crabRect.width) return
  const flight: Flight = { shell: snapshot(box), crab: snapshot(crab), boxRect, crabRect, animations: [] }
  active = flight
  // Slow startup falls back to the ordinary UI, rather than leaving a stale snapshot.
  flight.timer = setTimeout(() => { if (active === flight) cancelFirstSend() }, 2500)
  const cancel = (): void => { if (active === flight) cancelFirstSend() }
  return {
    cancel,
    release() { if (!flight.sessionId) cancel() },
    arm(id) {
      if (active !== flight || reduced()) { cancel(); return }
      flight.sessionId = id
      clearTimeout(flight.timer)
      flight.timer = setTimeout(cancel, 1600)
      const overlay = document.createElement('div')
      overlay.className = 'first-send-overlay'
      overlay.setAttribute('aria-hidden', 'true')
      overlay.inert = true
      flight.overlay = overlay
      place(flight.shell, flight.boxRect)
      flight.shell.classList.add('first-send-shell')
      overlay.append(flight.shell)
      document.body.append(overlay)
    }
  }
}

/** Called from App's layout effect, after the destination route has mounted. */
export function syncFirstSend(sessionId?: string): void {
  const flight = active
  if (!flight) return
  if (!sessionId || flight.sessionId !== sessionId || reduced()) { cancelFirstSend(); return }
  const deadline = performance.now() + 650
  const find = (): void => {
    if (active !== flight) return
    const root = document.querySelector<HTMLElement>('[data-first-send-target]')
    const bubble = root?.querySelector<HTMLElement>('[data-user-bubble]')
    const composer = root?.querySelector<HTMLElement>('[data-composer-surface]')
    const crab = root?.querySelector<SVGSVGElement>('.crab')
    if (root && bubble && composer && crab) {
      try { play(flight, root, bubble, composer, crab) } catch { cancelFirstSend() }
    } else if (performance.now() < deadline) flight.frame = requestAnimationFrame(find)
    else cancelFirstSend()
  }
  // Let destination scroll/focus layout settle before measuring either landing point.
  flight.frame = requestAnimationFrame(find)
}

function play(flight: Flight, root: HTMLElement, bubble: HTMLElement, composer: HTMLElement, crab: SVGSVGElement): void {
  const overlay = flight.overlay!
  const target = bubble.getBoundingClientRect(), landing = crab.getBoundingClientRect()
  if (target.bottom <= 52 || target.top >= innerHeight || !target.width) { cancelFirstSend(); return }
  const animate = (node: Element, frames: Keyframe[], options: KeyframeAnimationOptions): Animation => {
    const animation = node.animate(frames, { fill: 'both', ...options })
    flight.animations.push(animation)
    return animation
  }
  const shell = flight.shell
  const sourceContent = document.createElement('div')
  while (shell.firstChild) sourceContent.append(shell.firstChild)
  Object.assign(sourceContent.style, { width: `${flight.boxRect.width}px`, height: `${flight.boxRect.height}px` })
  shell.append(sourceContent)
  const destination = snapshot(bubble)
  const style = getComputedStyle(bubble)
  Object.assign(destination.style, { position: 'absolute', inset: '0 auto auto 0', width: `${target.width}px`, height: `${target.height}px`, maxWidth: 'none', backgroundColor: 'transparent', margin: '0', visibility: 'visible', fontSize: style.fontSize, lineHeight: style.lineHeight, fontFamily: style.fontFamily, fontWeight: style.fontWeight, letterSpacing: style.letterSpacing, color: style.color })
  shell.append(destination)
  animate(shell, [
    { left: `${flight.boxRect.x}px`, top: `${flight.boxRect.y}px`, width: `${flight.boxRect.width}px`, height: `${flight.boxRect.height}px`, borderRadius: '20px', borderWidth: '1px' },
    { left: `${target.x}px`, top: `${target.y}px`, width: `${target.width}px`, height: `${target.height}px`, borderRadius: style.borderRadius, backgroundColor: style.backgroundColor, borderColor: 'transparent', borderWidth: '0px', boxShadow: 'none' }
  ], { duration: 430, easing: EASE })
  animate(sourceContent, [{ opacity: 1 }, { opacity: 0 }], { duration: 150 })
  animate(destination, [{ opacity: 0 }, { opacity: 1 }], { delay: 110, duration: 240, easing: EASE })
  animate(composer, [{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'scale(1)' }], { delay: 100, duration: 360, easing: EASE })

  const choices = VARIANTS.filter(variant => variant !== previousVariant)
  const variant = choices[Math.floor(Math.random() * choices.length)]!
  previousVariant = variant
  const carrier = document.createElement('div')
  carrier.className = 'first-send-carrier'
  carrier.dataset.flightVariant = variant
  place(carrier, flight.crabRect)
  flight.crab.classList.add('first-send-flying-crab')
  const rotor = document.createElement('div')
  rotor.className = 'first-send-rotor'
  rotor.append(flight.crab)
  carrier.append(rotor)
  const trails = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  trails.setAttribute('viewBox', '0 0 96 66')
  trails.classList.add('first-send-trails')
  for (const d of ['M12 26C20 13 62 10 82 22', 'M84 37C73 50 35 55 15 44', 'M25 13C40 8 60 10 69 14']) {
    const path = document.createElementNS(trails.namespaceURI, 'path')
    path.setAttribute('d', d); trails.append(path)
  }
  carrier.append(trails); overlay.append(carrier)
  const dx = landing.x - flight.crabRect.x, dy = landing.y - flight.crabRect.y
  const translate = (x: number, y: number): string => `translate(${x}px, ${y}px)`
  // Sample a cubic arc with eased progress so launch, descent and landing share continuous velocity.
  const path = Array.from({ length: 61 }, (_, index): Keyframe => {
    const offset = index / 60
    const progress = Math.min(offset / .9, 1)
    const t = progress * progress * (3 - 2 * progress), inverse = 1 - t
    if (variant === 'hop') {
      // Rise gently to the apex, then accelerate down until contact at 90%.
      const fall = Math.max(0, Math.min((offset - .24) / .66, 1))
      const y = offset < .24 ? -24 * Math.sin(offset / .24 * Math.PI / 2) : -24 + (dy + 24) * fall * fall
      return { offset, transform: translate(dx * t, y) }
    }
    const x = 3 * inverse * inverse * t * 24 + 3 * inverse * t * t * (dx + 20) + t * t * t * dx
    const y = 3 * inverse * inverse * t * -28 + 3 * inverse * t * t * (dy * .62) + t * t * t * dy
    return { offset, transform: translate(x, y) }
  })
  animate(carrier, path, { duration: DURATION, easing: 'linear' })
  if (variant !== 'hop') {
    const rotation = variant === 'flip' ? 'rotateX' : 'rotate'
    const turns = variant === 'flip' ? 720 : 1080
    animate(rotor, [
      { offset: 0, transform: `${rotation}(0deg)` },
      { offset: .1, transform: `${rotation}(-12deg)` },
      { offset: .78, transform: `${rotation}(${turns - 40}deg)` },
      { offset: .9, transform: `${rotation}(${turns}deg)` },
      { offset: 1, transform: `${rotation}(${turns}deg)` }
    ], { duration: DURATION, easing: 'ease-in-out' })
  }
  // Squash at the feet independently of the rotation axis, keeping the landing anchored.
  animate(flight.crab, [
    { offset: 0, transform: 'scale(1)' },
    { offset: .9, transform: 'scale(1)' },
    { offset: .95, transform: 'scale(1.045,.9)' },
    { offset: 1, transform: 'scale(1)' }
  ], { duration: DURATION, easing: 'ease-in-out' })
  animate(trails, [
    { offset: 0, opacity: 0, transform: 'rotate(-20deg)' },
    { offset: .18, opacity: variant === 'hop' ? 0 : .24 },
    { offset: .6, opacity: variant === 'hop' ? 0 : .18 },
    { offset: .85, opacity: 0, transform: 'rotate(220deg)' },
    { offset: 1, opacity: 0, transform: 'rotate(220deg)' }
  ], { duration: DURATION })
  // Reveal the real message as soon as its morph finishes; replies remain live throughout.
  flight.animations[0].onfinish = () => { if (active === flight) { root.dataset.firstSendBubbleDone = ''; shell.style.visibility = 'hidden' } }
  const finish = (): void => { if (active === flight) { delete root.dataset.firstSendBubbleDone; cancelFirstSend() } }
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  window.addEventListener('resize', finish)
  window.addEventListener('wheel', finish, { passive: true })
  document.addEventListener('visibilitychange', finish)
  media?.addEventListener('change', finish)
  flight.removeListeners = () => {
    delete root.dataset.firstSendBubbleDone
    window.removeEventListener('resize', finish)
    window.removeEventListener('wheel', finish)
    document.removeEventListener('visibilitychange', finish)
    media?.removeEventListener('change', finish)
  }
  clearTimeout(flight.timer)
  flight.timer = setTimeout(finish, DURATION + 100)
  flight.animations.at(-1)!.onfinish = finish
}
