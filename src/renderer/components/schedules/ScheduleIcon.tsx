/** 定时任务图标：日历加右下角闹钟。线宽与 lucide 图标一致。 */
export function ScheduleIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12.5 20H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4.5" />
      <path d="M3 9.5h16" />
      <path d="M8 3v3.5M14 3v3.5" />
      <path d="M6.5 13h1M6.5 16.5h1" />
      <path d="M10.5 13h1" />
      <circle cx="17.5" cy="17.5" r="4" />
      <path d="M17.5 15.6v1.9l1.2 1" />
    </svg>
  )
}
