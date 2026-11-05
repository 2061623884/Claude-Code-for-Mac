import type { ReactNode } from 'react'

export const settingsInputClass = 'h-9 max-w-full rounded-lg border border-line bg-card px-2 text-[13px] disabled:opacity-50'
export const settingsButtonClass = 'rounded-lg bg-chip px-3 py-2 text-[12px] hover:bg-hover disabled:opacity-50'

export function Section({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="mt-7">
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="text-[12.5px] font-medium text-fg3">{title}</h2>
      {action}
    </div>
    {description && <p className="mb-3 text-[12px] text-fg2">{description}</p>}
    <div className="divide-y divide-line rounded-xl border border-line">{children}</div>
  </section>
}

export function Row({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
    <div className="min-w-0 flex-1">
      <div className="text-[13px]">{label}</div>
      {hint && <div className="mt-1 text-[12px] text-fg3">{hint}</div>}
    </div>
    <div className="max-w-full shrink-0">{children}</div>
  </div>
}

export function Toggle({ id, label, value, disabled, title, onChange }: { id?: string; label: string; value: boolean; disabled?: boolean; title?: string; onChange(value: boolean): void }) {
  return <button id={id} type="button" role="switch" aria-label={label} aria-checked={value} disabled={disabled} title={title} onClick={() => onChange(!value)} className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50 ${value ? 'bg-accent' : 'bg-line-strong'}`}><span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${value ? 'translate-x-4' : ''}`} /></button>
}
