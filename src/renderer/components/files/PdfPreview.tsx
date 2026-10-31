import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, PasswordResponses, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
GlobalWorkerOptions.workerSrc = workerUrl

export function PdfPreview({ base64 }: { base64: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [passwordPrompt, setPasswordPrompt] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const passwordCallback = useRef<((password: string) => void) | null>(null)
  const canvasHost = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(300)
  useEffect(() => {
    let cancelled = false
    canvasHost.current?.replaceChildren()
    setDoc(null); setError(null); setPage(1); setPasswordPrompt(null); setPassword('')
    const asset = (directory: string): string => new URL(`./pdfjs/${directory}/`, document.baseURI).href
    const task = getDocument({
      data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
      cMapUrl: asset('cmaps'), cMapPacked: true,
      standardFontDataUrl: asset('standard_fonts'), wasmUrl: asset('wasm'),
      // file:// 安装包通过主线程的资源读取器加载，不依赖 worker 的 HTTP fetch。
      useWorkerFetch: false
    })
    task.onPassword = (callback: (password: string) => void, reason: number) => {
      if (cancelled) return
      passwordCallback.current = callback
      setPasswordPrompt(reason === PasswordResponses.INCORRECT_PASSWORD ? '密码不正确，请重试' : '此 PDF 需要密码')
    }
    void task.promise.then((pdf) => { if (!cancelled) { setDoc(pdf); setPasswordPrompt(null); setPassword('') } }, (err: Error) => { if (!cancelled) { setError(err.message); setPasswordPrompt(null) } })
    return () => { cancelled = true; passwordCallback.current = null; void task.destroy() }
  }, [base64])
  useEffect(() => {
    if (!host.current) return
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(Math.max(100, entry.contentRect.width - 24)) })
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    let render: RenderTask | undefined
    setError(null)
    // 每次渲染使用独立 canvas，快速翻页/缩放时不会同时绘制同一画布。
    const node = document.createElement('canvas')
    node.className = 'mx-auto bg-white shadow-sm'
    void doc.getPage(page).then(async (pdfPage) => {
      if (cancelled) return
      const viewport = pdfPage.getViewport({ scale: width / pdfPage.getViewport({ scale: 1 }).width })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      node.width = Math.floor(viewport.width * ratio); node.height = Math.floor(viewport.height * ratio)
      node.style.width = `${viewport.width}px`; node.style.height = `${viewport.height}px`
      render = pdfPage.render({ canvas: node, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
      await render.promise
      if (!cancelled) canvasHost.current?.replaceChildren(node)
    }).catch((err: Error) => { if (!cancelled && err.name !== 'RenderingCancelledException') setError(err.message) })
    return () => { cancelled = true; render?.cancel() }
  }, [doc, page, width])
  return (
    <div ref={host} className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-center gap-3 border-b border-line px-3 py-2 text-[12px]">
        <button type="button" disabled={!doc || page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded px-2 py-1 hover:bg-hover disabled:opacity-30">上一页</button>
        <span>{doc ? `${page} / ${doc.numPages}` : error ? 'PDF 加载失败' : passwordPrompt ? '等待密码' : '加载 PDF…'}</span>
        <button type="button" disabled={!doc || page >= doc.numPages} onClick={() => setPage((p) => p + 1)} className="rounded px-2 py-1 hover:bg-hover disabled:opacity-30">下一页</button>
      </div>
      {passwordPrompt && <form className="flex flex-col gap-3 p-4 text-sm" onSubmit={(event) => { event.preventDefault(); passwordCallback.current?.(password); setPassword('') }}>
        <label htmlFor="pdf-password">{passwordPrompt}</label><input id="pdf-password" aria-label="PDF 密码" type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} className="rounded border border-line bg-chip p-2" /><button type="submit" disabled={!password} className="rounded bg-active p-2 disabled:opacity-40">解锁 PDF</button>
      </form>}
      {error && <p role="alert" className="p-4 text-danger">无法读取 PDF：{error}</p>}
      <div ref={canvasHost} hidden={Boolean(error || passwordPrompt)} className="min-h-0 flex-1 overflow-auto bg-chip p-3" />
    </div>
  )
}
