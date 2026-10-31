import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Globe, RotateCw, X } from 'lucide-react'
import type { BrowserState } from '@shared/workspace'
import { IconButton } from '../sidebar/SessionRow'

const EMPTY: BrowserState = { url: '', title: '', loading: false, back: false, forward: false, error: null }
export function BrowserPane({ id, active }: { id: string; active: boolean }) {
  const [state, setState] = useState(EMPTY)
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let cancelled = false
    const off = window.desk.browser.onState((target, next) => {
      if (target !== id) return
      setState(next)
      if (next.url && document.activeElement !== input.current) setAddress(next.url)
    })
    void window.desk.browser.open(id).then((next) => {
      if (cancelled) return
      setState(next); setAddress(next.url); setReady(true)
    }, (err: Error) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true; off(); void window.desk.browser.bounds(id, null).catch(() => {}) }
  }, [id])
  useEffect(() => {
    if (!ready || !viewport.current) return
    const update = (): void => {
      const rect = viewport.current!.getBoundingClientRect()
      void window.desk.browser.bounds(id, active && Boolean(state.url) && !state.error && !error
        ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null).catch(() => {})
    }
    const observer = new ResizeObserver(update)
    observer.observe(viewport.current)
    // 左右栏布局变化会移动视口，不一定改变它的尺寸。
    observer.observe(document.body)
    window.addEventListener('resize', update)
    update()
    return () => { observer.disconnect(); window.removeEventListener('resize', update); void window.desk.browser.bounds(id, null).catch(() => {}) }
  }, [id, ready, active, state.url, state.error, error])
  const action = (name: 'back' | 'forward' | 'reload' | 'stop'): void => {
    setError(null)
    void window.desk.browser.action(id, name).catch((err: Error) => setError(err.message))
  }
  return (
    <div className="flex h-full flex-col">
      <form className="flex shrink-0 items-center gap-1 border-b border-line px-2 pb-2" onSubmit={(e) => {
        e.preventDefault(); setError(null)
        void window.desk.browser.navigate(id, address).catch((err: Error) => setError(err.message))
      }}>
        <button type="button" disabled={!state.back} aria-label="后退" onClick={() => action('back')} className="rounded p-1 text-fg2 disabled:opacity-30"><ArrowLeft size={15} /></button>
        <button type="button" disabled={!state.forward} aria-label="前进" onClick={() => action('forward')} className="rounded p-1 text-fg2 disabled:opacity-30"><ArrowRight size={15} /></button>
        <IconButton label={state.loading ? '停止加载' : '刷新网页'} onClick={() => action(state.loading ? 'stop' : 'reload')}>{state.loading ? <X size={14} /> : <RotateCw size={14} />}</IconButton>
        <input ref={input} aria-label="网址" autoFocus value={address} onChange={(e) => setAddress(e.target.value)} onFocus={(e) => e.target.select()} placeholder="输入网址或 localhost:3000" className="h-8 min-w-0 flex-1 select-text rounded-lg border border-line-strong bg-chip px-2 text-[12px] outline-none focus:border-accent" />
        <button type="submit" disabled={!ready || !address.trim()} className="rounded-lg px-2 py-1 text-[12px] hover:bg-hover disabled:opacity-30">前往</button>
      </form>
      <div ref={viewport} className="min-h-0 flex-1">
        {(error || state.error) ? <div role="alert" className="break-words p-5 text-[13px] text-danger">{error || state.error}</div> : !state.url && <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-fg3"><Globe size={42} strokeWidth={1} /><p>输入网址，在侧栏中浏览网页</p></div>}
      </div>
    </div>
  )
}
