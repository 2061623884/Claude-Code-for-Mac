import { useEffect, useRef, useState } from 'react'

// 小中心和细长光束分别变化；圆形线帽保证展开时的末端圆润。
function sparkPath(compact: boolean): string {
  const lengths = [10, 9.1, 10.4, 9.4, 10.1, 8.9, 10.3, 9.5, 10.2, 9.2, 9.9, 9.4]
  return lengths.map((length, index) => {
    const angle = (index * 30 - 90) * Math.PI / 180
    const point = (radius: number): string => `${(12 + radius * Math.cos(angle)).toFixed(3)} ${(12 + radius * Math.sin(angle)).toFixed(3)}`
    return `M ${point(compact ? 2.2 : 1.5)} L ${point(compact ? 2.6 + (length - 9) * 0.12 : length)}`
  }).join(' ')
}
const EXPANDED = sparkPath(false), COMPACT = sparkPath(true)
const TIMING = { dur: '1.8s', repeatCount: 'indefinite', calcMode: 'spline' as const, keyTimes: '0;0.5;1', keySplines: '0.42 0 0.58 1;0.42 0 0.58 1' }

export function ActivitySpark({ active = true }: { active?: boolean }) {
  const svg = useRef<SVGSVGElement>(null)
  const [allowed, setAllowed] = useState(false)
  const [intersects, setIntersects] = useState(true)
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const update = (): void => setAllowed(!document.hidden && !media?.matches)
    update()
    document.addEventListener('visibilitychange', update)
    media?.addEventListener('change', update)
    return () => { document.removeEventListener('visibilitychange', update); media?.removeEventListener('change', update) }
  }, [])
  useEffect(() => {
    if (!svg.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setIntersects(entry.isIntersecting))
    observer.observe(svg.current)
    return () => observer.disconnect()
  }, [])
  const animate = active && allowed && intersects
  return <svg ref={svg} data-activity-spark data-animated={animate} aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" className="shrink-0 text-accent">
    <path d={EXPANDED} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      {animate && <animate attributeName="d" values={`${EXPANDED};${COMPACT};${EXPANDED}`} {...TIMING} />}
    </path>
    <circle cx="12" cy="12" r="1.8" fill="currentColor">
      {animate && <animate attributeName="r" values="1.8;3;1.8" {...TIMING} />}
    </circle>
  </svg>
}

export function ActivityIndicator({ label, active = true }: { label: string; active?: boolean }) {
  return <div role="status" className="flex min-h-6 items-center gap-2 text-[13px] text-fg2"><ActivitySpark active={active} /><span>{label}</span></div>
}
