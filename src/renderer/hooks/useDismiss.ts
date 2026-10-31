import { useEffect, useRef, type RefObject } from 'react'

/** 弹出层（菜单、浮层、明细框）：打开期间点外面或按 Esc 时关闭。已被别处处理过的 Esc 不再响应 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: (reason: 'outside' | 'escape', event: Event) => void
): void {
  const latest = useRef(onDismiss)
  latest.current = onDismiss
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) latest.current('outside', e)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.defaultPrevented) latest.current('escape', e)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, ref])
}
