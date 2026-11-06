import { useEffect, useRef, useState } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

/** 终端配色跟随系统浅色 / 深色，底色与 theme.css 的 --bg 一致 */
const LIGHT_THEME: ITheme = {
  background: '#ffffff', foreground: '#37352f', cursor: '#37352f', cursorAccent: '#ffffff', selectionBackground: '#37352f26',
  black: '#37352f', red: '#c4402f', green: '#3f7d3a', yellow: '#9a6b00', blue: '#2f6fb3', magenta: '#9b4f96', cyan: '#1f7f86', white: '#a5a49f',
  brightBlack: '#787774', brightRed: '#d0533f', brightGreen: '#4a8f44', brightYellow: '#a87a10', brightBlue: '#3b7fc4', brightMagenta: '#ad5ea8', brightCyan: '#25909a', brightWhite: '#d6d5d0',
}
const DARK_THEME: ITheme = { background: '#262624', foreground: '#e8e6df', cursor: '#e8e6df', cursorAccent: '#262624', selectionBackground: '#ffffff33' }
const DARK_QUERY = '(prefers-color-scheme: dark)'
const terminalTheme = () => (window.matchMedia?.(DARK_QUERY).matches ? DARK_THEME : LIGHT_THEME)

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
    const term = new Terminal({ fontSize: 12, fontFamily: '"SF Mono", Menlo, monospace', cursorBlink: true, scrollback: 5000, theme: terminalTheme() })
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
    const scheme = window.matchMedia?.(DARK_QUERY)
    const onScheme = () => { term.options.theme = terminalTheme() }
    scheme?.addEventListener('change', onScheme)
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
      observer.disconnect(); scheme?.removeEventListener('change', onScheme); offData(); offExit(); input.dispose(); resize.dispose(); term.dispose()
      terminal.current = null; fit.current = null
    }
  }, [id, cwd, generation])
  useEffect(() => {
    if (active && host.current?.clientWidth) { fit.current?.fit(); terminal.current?.focus() }
  }, [active])
  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      <div title={cwd} className="truncate border-b border-line px-3 py-2 font-mono text-[11px] text-fg3">{cwd ?? '未选择项目'}</div>
      {(error || exited) && <div role="status" className="flex items-center gap-2 px-3 py-2 text-[12px]"><span className="min-w-0 flex-1 break-words">{error || '终端已退出'}</span><button type="button" className="shrink-0 rounded bg-chip px-2 py-1" onClick={() => {
        void window.desk.terminal.close(id).then(() => setGeneration((v) => v + 1), (err: Error) => setError(err.message))
      }}>重新启动</button></div>}
      <div ref={host} className="min-h-0 flex-1 overflow-hidden p-2" />
    </div>
  )
}
