/** 技能与插件图标：星星魔法棒加两颗闪光。线宽与 lucide 图标一致。 */
export function SkillsIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7.27 3.67 9.8 6.53l3.73-.82L11.6 9l1.93 3.29-3.73-.82-2.53 2.86-.37-3.8L3.4 9l3.5-1.53Z" />
      <path d="m11.2 12.6 8.3 8.4" />
      <path d="M19 3.2l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7Z" />
      <path d="M5 17.5v3M3.5 19h3" />
    </svg>
  )
}
