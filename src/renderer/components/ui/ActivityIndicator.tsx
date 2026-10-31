import { useEffect, useId, useRef, useState } from 'react'
import frame0 from '../../assets/spark/frame-01.png'
import frame1 from '../../assets/spark/frame-02.png'
import frame2 from '../../assets/spark/frame-03.png'
import frame3 from '../../assets/spark/frame-04.png'
import frame4 from '../../assets/spark/frame-05.png'
import frame5 from '../../assets/spark/frame-06.png'
import frame6 from '../../assets/spark/frame-07.png'
import frame7 from '../../assets/spark/frame-08.png'
import frame8 from '../../assets/spark/frame-09.png'

// Reference silhouettes and cadence, not synthesized rays. See assets/spark/README.md.
const FRAMES = [frame0, frame1, frame2, frame3, frame4, frame5, frame6, frame7, frame8]
const FRAME_TIMES = Array.from({ length: 10 }, (_, i) => i / 9).join(';')

export function ActivitySpark({ active = true }: { active?: boolean }) {
  const id = useId()
  const maskId = `spark-mask-${id}`, filterId = `spark-alpha-${id}`
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
  return <svg ref={svg} data-activity-spark data-animated={animate} aria-hidden="true" width="20" height="20" viewBox="0 0 120 120" className="shrink-0 text-accent">
    <defs>
      <filter id={filterId} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 -1.50887574 0 1.50887574" />
      </filter>
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120" style={{ maskType: 'alpha' }}>
        <g filter={`url(#${filterId})`}>
          {FRAMES.map((frame, index) => <image key={index} href={frame} width="120" height="120" opacity={index === 4 ? 1 : 0}>
            {animate && <animate attributeName="opacity" values={Array.from({ length: 10 }, (_, step) => step % 9 === index ? 1 : 0).join(';')} keyTimes={FRAME_TIMES} dur="0.81s" repeatCount="indefinite" calcMode="discrete" />}
          </image>)}
        </g>
      </mask>
    </defs>
    <rect width="120" height="120" fill="currentColor" mask={`url(#${maskId})`} />
  </svg>
}

export function ActivityIndicator({ label, active = true, iconOnly = false }: { label: string; active?: boolean; iconOnly?: boolean }) {
  return <div role="status" aria-label={label} className={`flex min-h-6 items-center gap-2 text-[13px] text-fg2 ${iconOnly ? '-ml-2' : ''}`}><ActivitySpark active={active} />{!iconOnly && <span>{label}</span>}</div>
}
