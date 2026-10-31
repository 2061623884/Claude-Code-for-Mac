import { useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { useDismiss } from '../../hooks/useDismiss'

export interface MenuItem {
  key: string
  label: ReactNode
  description?: ReactNode
  icon?: ReactNode
  checked?: boolean
  danger?: boolean
  separatorBefore?: boolean
  onSelect(): void
}

interface MenuProps {
  trigger(props: { open: boolean; toggle(): void }): ReactNode
  items: MenuItem[]
  align?: 'left' | 'right'
  placement?: 'top' | 'bottom'
  width?: number
  defaultOpen?: boolean
}

export function Menu({ trigger, items, align = 'left', placement = 'bottom', width = 240, defaultOpen = false }: MenuProps) {
  const [open, setOpen] = useState(defaultOpen)
  const ref = useRef<HTMLDivElement>(null)

  useDismiss(ref, open, () => setOpen(false))

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen(!open) })}
      {open && (
        <div
          role="menu"
          className={`animate-menu-in absolute z-40 rounded-xl border border-line bg-card p-1 shadow-pop ${
            placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } ${align === 'right' ? 'right-0' : 'left-0'}`}
          style={
            {
              width,
              // 从触发按钮那一侧弹出
              transformOrigin: `${placement === 'top' ? 'bottom' : 'top'} ${align}`,
              '--menu-from': placement === 'top' ? '4px' : '-4px'
            } as React.CSSProperties
          }
        >
          {items.map((item, i) => (
            <div key={item.key} style={{ animationDelay: `${20 + i * 18}ms` }}>
              {item.separatorBefore && <div className="mx-2 my-1 h-px bg-line" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-hover ${
                  item.danger ? 'text-danger' : 'text-fg'
                }`}
              >
                {item.icon && <span className="mt-0.5 shrink-0 text-fg2">{item.icon}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.description && <span className="block truncate text-[12px] text-fg3">{item.description}</span>}
                </span>
                {item.checked && <Check size={15} className="mt-0.5 shrink-0" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
