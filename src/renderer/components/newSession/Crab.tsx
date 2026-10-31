// 像素小螃蟹（Claude Code 的吉祥物造型），趴在输入框上沿。
// 每次出现随机挑一个位置和出场方式；之后每隔几秒随机换一个小动作（挥钳子、横着走、东张西望、跳舞、打瞌睡…）；
// 鼠标移上去跳一下，点它会随机做个反应。
// 每个像素宽 1、高 2，和终端里用方块字符画出来的比例一致。
import { useEffect, useState } from 'react'

const BODY = ['...############...', '...##.######.##...', '..##############..', '...############...']
/** 两只钳子（第 3 行最外侧的像素），单独画出来才能挥动 */
const CLAWS = { left: 1, right: 16 }
const LEGS = { a: [4, 11], b: [6, 13] }
const EYES = [5, 12]
const COLOR = '#d97757'

const ENTRANCES = ['drop', 'rise', 'walk', 'spin'] as const
const ACTIONS = ['idle', 'wave', 'walk', 'look', 'dance', 'sleep'] as const
const REACTIONS = ['hop', 'spin', 'wave', 'dance'] as const
/** 出现位置：输入框上沿从左到右的几个点 */
const SPOTS = ['6%', '18%', '42%', '68%', '82%']

type Action = (typeof ACTIONS)[number] | (typeof REACTIONS)[number]

const pick = <T,>(list: readonly T[], not?: T): T => {
  const pool = list.filter((x) => x !== not)
  return pool[Math.floor(Math.random() * pool.length)]!
}

function runs(row: string, y: number): { x: number; y: number; w: number }[] {
  const out: { x: number; y: number; w: number }[] = []
  for (let x = 0; x < row.length; x++) {
    if (row[x] !== '#') continue
    let w = 1
    while (row[x + w] === '#') w++
    out.push({ x, y, w })
    x += w - 1
  }
  return out
}

const bodyRects = BODY.flatMap((row, i) => runs(row, i * 2))
const LEG_Y = BODY.length * 2

export function Crab({ className = '' }: { className?: string }) {
  const [entrance] = useState(() => pick(ENTRANCES))
  const [spot] = useState(() => pick(SPOTS))
  const [action, setAction] = useState<Action>('idle')
  // 点一下的反应，做完回到原来的动作
  const [reaction, setReaction] = useState<{ name: Action; n: number } | null>(null)

  // 出场动画结束后，每隔 6～10 秒随机换一个动作
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const next = (delay: number): void => {
      timer = setTimeout(() => {
        setAction((prev) => pick(ACTIONS, prev))
        next(6000 + Math.random() * 4000)
      }, delay)
    }
    next(1400)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!reaction) return
    const id = setTimeout(() => setReaction(null), 1300)
    return () => clearTimeout(id)
  }, [reaction])

  const current = reaction?.name ?? action

  return (
    <div style={{ left: spot }} className={className}>
      <div className={`crab-enter-${entrance}`}>
        <svg
          viewBox="0 -4 18 14"
          width={54}
          height={42}
          shapeRendering="crispEdges"
          aria-hidden
          key={reaction?.n}
          onClick={() => setReaction({ name: pick(REACTIONS), n: Date.now() })}
          className={`crab crab-${current}`}
        >
          <g className="crab-legs-a">
            {LEGS.a.map((x) => (
              <rect key={x} x={x} y={LEG_Y} width={1} height={2} fill={COLOR} />
            ))}
          </g>
          <g className="crab-legs-b">
            {LEGS.b.map((x) => (
              <rect key={x} x={x} y={LEG_Y} width={1} height={2} fill={COLOR} />
            ))}
          </g>
          <g className="crab-body">
            {bodyRects.map((r) => (
              <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={2} fill={COLOR} />
            ))}
            <rect className="crab-claw-l" x={CLAWS.left} y={4} width={1} height={2} fill={COLOR} />
            <rect className="crab-claw-r" x={CLAWS.right} y={4} width={1} height={2} fill={COLOR} />
            <g className="crab-eyes">
              {EYES.map((x) => (
                <rect key={x} x={x} y={2} width={1} height={2} fill="#2b2a27" />
              ))}
            </g>
          </g>
          {current === 'sleep' && (
            <g className="crab-zzz" fill="#a5a49f">
              <rect x={14} y={-1} width={2} height={1} />
              <rect x={15} y={-2} width={1} height={1} />
              <rect x={14} y={-3} width={2} height={1} />
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}
