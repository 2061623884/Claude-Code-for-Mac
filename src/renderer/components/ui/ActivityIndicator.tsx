import { useEffect, useRef, useState } from 'react'

// 两种轮廓使用相同的二次曲线拓扑，内收时尖角随轮廓变化，不缩放整张图片。
function sparkPath(compact: boolean): string {
  const rays = [10, 9.1, 10.4, 9.4, 10.1, 8.9, 10.3, 9.5, 10.2, 9.2, 9.9, 9.4]
  const points = rays.flatMap((length, ray) => [-10, -3, 3].map((offset, edge) => {
    const angle = ((ray * 30 + offset - 90) * Math.PI) / 180
    const radius = compact ? 3.2 + 0.15 * Math.sin(ray) : edge === 0 ? 4.7 : length
    return { x: 12 + radius * Math.cos(angle), y: 12 + radius * Math.sin(angle) }
  }))
  const number = (n: number): string => n.toFixed(3)
  const midpoint = (a: typeof points[number], b: typeof points[number]): string => `${number((a.x + b.x) / 2)} ${number((a.y + b.y) / 2)}`
  return `M ${midpoint(points.at(-1)!, points[0])} ` + points.map((point, i) => `Q ${number(point.x)} ${number(point.y)} ${midpoint(point, points[(i + 1) % points.length])}`).join(' ') + ' Z'
}
const EXPANDED = sparkPath(false), COMPACT = sparkPath(true)

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
    <path d={EXPANDED} fill="currentColor">
      {animate && <animate attributeName="d" values={`${EXPANDED};${COMPACT};${EXPANDED}`} dur="1.8s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1" />}
    </path>
  </svg>
}

export function ActivityIndicator({ label, active = true }: { label: string; active?: boolean }) {
  return <div role="status" className="flex min-h-6 items-center gap-2 text-[13px] text-fg2"><ActivitySpark active={active} /><span>{label}</span></div>
}
