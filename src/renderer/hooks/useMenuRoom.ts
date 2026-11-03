import { useLayoutEffect, useState, type RefObject } from 'react'

export function useMenuRoom(ref: RefObject<HTMLDivElement | null>, open: boolean) {
  const [room, setRoom] = useState<number>()
  useLayoutEffect(() => {
    const anchor = ref.current
    if (!open || !anchor) return
    function measure() {
      if (!anchor) return
      let top = 0
      for (let parent = anchor.parentElement; parent; parent = parent.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) {
          top = Math.max(top, parent.getBoundingClientRect().top)
        }
      }
      setRoom(Math.max(0, anchor.getBoundingClientRect().top - top - 16))
    }
    measure()
    window.addEventListener('resize', measure)
    document.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      document.removeEventListener('scroll', measure, true)
    }
  }, [open, ref])
  return room
}
