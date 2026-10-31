import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export function TerminalPane({ id, cwd, active }: { id: string; cwd?: string; active: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal | null>(null)
  const fit = useRef<FitAddon | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exited, setExited] = useState(false)
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    if (!cwd || !host.current) return
    let cancelled = false
    const term = new Terminal({ fontSize: 12, fontFamily: '"SF Mono", Menlo, monospace', cursorBlink: true, scrollback: 5000, theme: { background: '#202020', foreground: '#e8e6df' } })
    const addon = new FitAddon()
    term.loadAddon(addon)
    term.open(host.current)
    terminal.current = term
    fit.current = addon
    setError(null)
    setExited(false)
    const offData = window.desk.terminal.onData((target, data) => { if (target === id) term.write(data) })
    const offExit = window.desk.terminal.onExit((target, code) => {
      if (target !== id) return
      setExited(true)
      term.writeln(`\r\n[进程已退出，状态码 ${code}]`)
    })
    const input = term.onData((data) => { void window.desk.terminal.write(id, data).catch((e: Error) => setError(e.message)) })
    const resize = term.onResize(({ cols, rows }) => { void window.desk.terminal.resize(id, cols, rows).catch(() => {}) })
    const observer = new ResizeObserver(() => { if (host.current?.clientWidth && host.current.clientHeight) addon.fit() })
    observer.observe(host.current)
    void window.desk.terminal.open(id, cwd).then((state) => {
      if (cancelled) return
      if (state.output) term.write(state.output)
      setExited(state.exited)
      if (host.current?.clientWidth && host.current.clientHeight) addon.fit()
    }, (err: Error) => { if (!cancelled) setError(err.message) })
    return () => {
      cancelled = true
      observer.disconnect(); offData(); offExit(); input.dispose(); resize.dispose(); term.dispose()
      terminal.current = null; fit.current = null
    }
  }, [id, cwd, generation])
  useEffect(() => {
    if (active && host.current?.clientWidth) { fit.current?.fit(); terminal.current?.focus() }
  }, [active])
  return (
    <div className="flex h-full flex-col bg-[#202020] text-[#e8e6df]">
      <div title={cwd} className="truncate border-b border-white/10 px-3 py-2 font-mono text-[11px] text-white/50">{cwd ?? '未选择项目'}</div>
      {(error || exited) && <div role="status" className="flex items-center gap-2 px-3 py-2 text-[12px]"><span className="min-w-0 flex-1 break-words">{error || '终端已退出'}</span><button type="button" className="shrink-0 rounded bg-white/10 px-2 py-1" onClick={() => {
        void window.desk.terminal.close(id).then(() => setGeneration((v) => v + 1), (err: Error) => setError(err.message))
      }}>重新启动</button></div>}
      <div ref={host} className="min-h-0 flex-1 overflow-hidden p-2" />
    </div>
  )
}
