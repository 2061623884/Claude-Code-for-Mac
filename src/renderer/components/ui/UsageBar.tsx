/** 套餐用量的一个限额窗口：名称、已用/剩余、进度条（≥90% 变红）、重置时间 */
export function UsageBar({ label, percent, reset }: { label: string; percent: number; reset?: string }) {
  const used = Math.round(percent)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span>{label}</span>
        <span className="text-[12.5px] text-fg2 tabular-nums">
          已用 {used}% · 剩余 {Math.max(100 - used, 0)}%
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-chip">
        <div
          style={{ width: `${Math.min(used, 100)}%` }}
          className={`animate-bar-grow h-full rounded-full transition-[width] duration-700 ${used >= 90 ? 'bg-danger' : 'bg-accent'}`}
        />
      </div>
      {reset && <div className="mt-1.5 text-[12px] text-fg3">{reset}</div>}
    </div>
  )
}
