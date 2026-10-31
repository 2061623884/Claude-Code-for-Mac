import { useModalLayer } from '../../modalStore'
import { useEffect, type ReactNode } from 'react'

interface DialogProps {
  title: string
  children: ReactNode
  footer: ReactNode
  onClose(): void
  width?: number
}

export function Dialog({ title, children, footer, onClose, width = 440 }: DialogProps) {
  useModalLayer()
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[80vh] overflow-hidden rounded-2xl border border-line bg-card shadow-pop flex flex-col"
        style={{ width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-2 text-[15px] font-semibold">{title}</div>
        <div className="px-5 pb-4 overflow-y-auto text-fg2">{children}</div>
        <div className="flex justify-end gap-2 px-5 pb-5">{footer}</div>
      </div>
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled
}: {
  children: ReactNode
  onClick?(): void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
}) {
  const styles = {
    primary: 'bg-accent text-accent-fg hover:opacity-90',
    secondary: 'bg-chip text-fg hover:bg-active',
    danger: 'bg-danger text-white hover:opacity-90'
  }[variant]
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-8 rounded-lg px-3.5 text-[13px] font-medium transition-colors disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  )
}
