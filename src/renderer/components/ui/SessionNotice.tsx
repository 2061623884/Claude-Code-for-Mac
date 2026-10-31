import { useEffect } from 'react'
import { openNotice, useNotice } from '../../notify'
export function SessionNotice() {
  const notice = useNotice((s) => s.notice)
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => useNotice.setState({ notice: null }), 8000)
    return () => clearTimeout(timer)
  }, [notice])
  if (!notice) return null
  return (
    <div
      role="status"
      className="absolute bottom-5 left-1/2 z-50 flex max-w-[420px] -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-card p-3 text-sm shadow-pop"
    >
      <button className="min-w-0 text-left" onClick={() => openNotice(notice.sessionId)}>
        <span className="block font-medium">{notice.title}</span>
        <span className="block truncate text-xs text-fg3">{notice.body}</span>
      </button>
      <button aria-label="关闭提醒" onClick={() => useNotice.setState({ notice: null })}>
        ×
      </button>
    </div>
  )
}
