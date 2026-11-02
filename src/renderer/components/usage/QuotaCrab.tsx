import { useId } from 'react'

const CRAB = 'M12 12H28V18H31V21H28V25H25V28H23V25H17V28H15V25H12V21H9V18H12Z'
const normalize = (value?: number | null): number | null => typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null

/** Independent remaining-quota meters: five-hour arc and weekly fill height. */
export function QuotaCrab({ fiveHour, weekly }: { fiveHour?: number | null; weekly?: number | null }) {
  const clip = useId()
  const five = normalize(fiveHour), week = normalize(weekly)
  const circumference = 2 * Math.PI * 17
  const fillHeight = 16 * (week ?? 0) / 100
  return <svg aria-hidden="true" data-quota-crab data-five-hour={five ?? 'unknown'} data-weekly={week ?? 'unknown'} viewBox="0 0 40 40" className="size-6 shrink-0 overflow-visible">
    <defs><clipPath id={clip}><path d={CRAB} /></clipPath></defs>
    <circle cx="20" cy="20" r="17" fill="none" stroke="var(--line-strong)" strokeWidth="3" />
    {five !== null && five > 0 && <circle data-quota-ring cx="20" cy="20" r="17" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - five / 100)} transform="rotate(-90 20 20)" className="transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none" />}
    <path d={CRAB} fill="var(--line-strong)" />
    {week !== null && <rect data-quota-fill x="9" y={28 - fillHeight} width="22" height={fillHeight} fill="var(--accent)" clipPath={`url(#${clip})`} className="transition-[y,height] duration-500 motion-reduce:transition-none" />}
    <path d="M15 15H17V18H15ZM23 15H25V18H23Z" fill="var(--fg)" />
  </svg>
}
