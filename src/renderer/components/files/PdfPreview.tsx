import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
GlobalWorkerOptions.workerSrc = workerUrl

export function PdfPreview({ base64 }: { base64: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(300)
  useEffect(() => {
    let cancelled = false
    setDoc(null); setError(null); setPage(1)
    const task = getDocument({ data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) })
    void task.promise.then((pdf) => { if (!cancelled) setDoc(pdf) }, (err: Error) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true; void task.destroy() }
  }, [base64])
  useEffect(() => {
    if (!host.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(100, entry.contentRect.width - 24)))
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!doc || !canvas.current) return
    let cancelled = false
    let render: RenderTask | undefined
    void doc.getPage(page).then(async (pdfPage) => {
      if (cancelled || !canvas.current) return
      const viewport = pdfPage.getViewport({ scale: width / pdfPage.getViewport({ scale: 1 }).width })
      const ratio = window.devicePixelRatio || 1
      const node = canvas.current
      node.width = Math.floor(viewport.width * ratio); node.height = Math.floor(viewport.height * ratio)
      node.style.width = `${viewport.width}px`; node.style.height = `${viewport.height}px`
      render = pdfPage.render({ canvas: node, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
      await render.promise
    }).catch((err: Error) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true; render?.cancel() }
  }, [doc, page, width])
  return (
    <div ref={host} className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-center gap-3 border-b border-line px-3 py-2 text-[12px]">
        <button type="button" disabled={!doc || page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded px-2 py-1 hover:bg-hover disabled:opacity-30">上一页</button>
        <span>{doc ? `${page} / ${doc.numPages}` : '加载 PDF…'}</span>
        <button type="button" disabled={!doc || page >= doc.numPages} onClick={() => setPage((p) => p + 1)} className="rounded px-2 py-1 hover:bg-hover disabled:opacity-30">下一页</button>
      </div>
      {error ? <p role="alert" className="p-4 text-danger">无法读取 PDF：{error}</p> : <div className="min-h-0 flex-1 overflow-auto bg-chip p-3"><canvas ref={canvas} className="mx-auto bg-white shadow-sm" /></div>}
    </div>
  )
}
