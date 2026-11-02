import type { CrabPose } from './crabActivity'

const BODY = ['...############...', '...##.######.##...', '..##############..', '...############...']
const COLOR = '#d97757'
const pixels = BODY.flatMap((row, y) => [...row].flatMap((pixel, x) => pixel === '#' ? [{ x, y: y * 2 }] : []))

/** Fixed pixel mascot; the extended viewBox leaves room for the bulb and stationery. */
export function Crab({ pose = 'idle' }: { pose?: CrabPose }) {
  return <svg viewBox="-2 -7 26 17" width={78} height={51} shapeRendering="crispEdges" aria-hidden="true" className={`crab crab-${pose}`} data-crab-pose={pose}>
    <rect x={-2} y={-7} width={26} height={17} fill="transparent" />
    <g fill={COLOR}>
      {[4, 6, 11, 13].map(x => <rect key={x} x={x} y={8} width={1} height={2} />)}
      <g className="crab-body">
        {pixels.map(p => <rect key={`${p.x}-${p.y}`} {...p} width={1} height={2} />)}
        <rect className="crab-claw-l" x={1} y={4} width={1} height={2} />
        <rect className="crab-claw-r" x={16} y={4} width={1} height={2} />
        <g className="crab-eyes" fill="#2b2a27">
          {[5, 12].map(x => <rect key={x} x={x} y={2} width={1} height={2} />)}
        </g>
        {pose === 'writing' && <g fill="none" stroke="#34302e" strokeWidth={0.65}>
          <rect x={3.5} y={1} width={4} height={3.5} /><rect x={10.5} y={1} width={4} height={3.5} />
          <path d="M7.5 2h3M2 1.5h1.5M14.5 1.5H16" />
        </g>}
      </g>
    </g>
    {pose === 'sleep' && <g className="crab-zzz" fill="currentColor"><path d="M15-5h3v1h-1v1h-1v1h2v1h-3v-1h1v-1h1v-1h-2z" /></g>}
    {pose === 'thinking' && <g className="crab-bulb" transform="translate(8 0)">
      <path fill="#edbd56" d="M8-6h4v1h1v3h-1v1H8v-1H7v-3h1z" />
      <path fill="#8f8069" d="M9-1h2v1H9z" /><path fill="#fff0aa" d="M8-5h1v2H8z" />
    </g>}
    {pose === 'writing' && <g>
      <path fill="#f4e9d6" stroke="#a8987a" strokeWidth={0.4} d="M17 2h6v7h-6z" />
      <path stroke="#a8987a" strokeWidth={0.4} d="M18 5h3M18 7h3" />
      <g className="crab-pencil"><path stroke="#e9b34c" strokeWidth={1.2} d="m17 5 4-5" /><path stroke="#34302e" strokeWidth={0.7} d="m16.5 5.7.5-.7" /></g>
    </g>}
    {pose === 'error' && <path fill="var(--danger, #ba493b)" d="M19-4h1v4h-1zM19 1h1v1h-1z" />}
  </svg>
}
