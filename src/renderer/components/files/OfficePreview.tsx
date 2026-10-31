import { useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import type { OfficeRequest, OfficeResponse, SheetInfo } from '@shared/officePreview'

export function documentHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 's', 'sup', 'sub', 'ol', 'ul', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'blockquote', 'pre', 'code', 'span', 'a'],
    ALLOWED_ATTR: ['src', 'alt', 'colspan', 'rowspan', 'id'],
    ALLOW_DATA_ATTR: false
  })
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';"><style>body{font:15px/1.7 system-ui;color:#202124;padding:20px;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%;display:block;overflow:auto}td,th{border:1px solid #ddd;padding:6px 10px}pre{white-space:pre-wrap}h1,h2,h3{line-height:1.4}</style>${clean}`
}
const ROW = 28, COL = 140, GUTTER = 52, HEADER = 30
export function columnLabel(index: number): string {
  let label = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label
  return label
}
export function OfficePreview({ base64, format }: { base64: string; format: 'docx' | 'spreadsheet' }) {
  const [html, setHtml] = useState<string | null>(null)
  const [sheets, setSheets] = useState<SheetInfo[] | null>(null)
  const [sheet, setSheet] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState({ row: 0, column: 0, rows: 35, columns: 8 })
  const [cells, setCells] = useState<{ requestId: number; values: string[][] } | null>(null)
  const worker = useRef<Worker | null>(null)
  const requestId = useRef(0)
  const grid = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setHtml(null); setSheets(null); setError(null); setSheet(0); setCells(null)
    setRange({ row: 0, column: 0, rows: 35, columns: 8 })
    const instance = new Worker(new URL('../../office.worker.ts', import.meta.url), { type: 'module' })
    worker.current = instance
    instance.onmessage = ({ data }: MessageEvent<OfficeResponse>) => {
      if (data.kind === 'docx') setHtml(documentHtml(data.html))
      else if (data.kind === 'sheets') setSheets(data.sheets)
      else if (data.kind === 'error') setError(data.message)
      else if (data.requestId === requestId.current) setCells(data)
    }
    instance.onerror = () => setError('文档解析失败，请检查文件是否完整或受密码保护。')
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    instance.postMessage({ kind: 'load', format, data } satisfies OfficeRequest, [data.buffer])
    const timeout = setTimeout(() => { instance.terminate(); setError('文档解析超时，请使用默认应用打开。') }, 30000)
    instance.addEventListener('message', () => clearTimeout(timeout), { once: true })
    return () => { clearTimeout(timeout); instance.terminate(); worker.current = null }
  }, [base64, format])
  useEffect(() => {
    if (!sheets?.[sheet]) return
    const id = ++requestId.current
    setCells(null)
    worker.current?.postMessage({ kind: 'range', sheet, ...range, requestId: id } satisfies OfficeRequest)
  }, [sheet, sheets, range])
  useEffect(() => {
    const element = grid.current
    if (!element) return
    const update = (): void => {
      const next = { row: Math.max(0, Math.floor(element.scrollTop / ROW) - 1), column: Math.max(0, Math.floor(element.scrollLeft / COL) - 1), rows: Math.min(150, Math.ceil(element.clientHeight / ROW) + 4), columns: Math.min(50, Math.ceil(element.clientWidth / COL) + 4) }
      setRange((old) => Object.keys(next).every((key) => next[key as keyof typeof next] === old[key as keyof typeof old]) ? old : next)
    }
    const observer = new ResizeObserver(update)
    observer.observe(element); element.addEventListener('scroll', update); update()
    return () => { observer.disconnect(); element.removeEventListener('scroll', update) }
  }, [sheets])
  if (error) return <p role="alert" className="p-4 text-sm text-danger">无法预览文档：{error}</p>
  if (html !== null) return <iframe title="DOCX 文档预览" sandbox="" srcDoc={html} className="h-full w-full border-0 bg-white" />
  if (!sheets) return <p role="status" className="p-4 text-sm text-fg3">正在解析文档…</p>
  const info = sheets[sheet]
  return <div className="flex h-full min-h-0 flex-col">
    <div role="tablist" aria-label="工作表" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2">
      {sheets.map((s, i) => <button key={s.name} type="button" role="tab" aria-selected={sheet === i} onClick={() => { setSheet(i); setCells(null); setRange((r) => ({ ...r, row: 0, column: 0 })); grid.current?.scrollTo(0, 0) }} className={`shrink-0 rounded px-3 py-1 text-xs ${sheet === i ? 'bg-active' : 'hover:bg-hover'}`}>{s.name}</button>)}
    </div>
    <div ref={grid} role="grid" aria-label={info?.name ?? '工作表'} aria-rowcount={info?.rows ?? 0} aria-colcount={info?.columns ?? 0} className="min-h-0 flex-1 overflow-auto text-xs">
      {!info?.rows ? <p className="p-4 text-fg3">空工作表</p> : <div className="relative" style={{ width: GUTTER + info.columns * COL, height: HEADER + info.rows * ROW }}>
        {Array.from({ length: Math.min(range.columns, info.columns - range.column) }, (_, c) => <div key={`h${c}`} className="absolute border-b border-r border-line bg-chip text-center" style={{ left: GUTTER + (range.column + c) * COL, top: 0, width: COL, height: HEADER }}>{columnLabel(range.column + c)}</div>)}
        {Array.from({ length: Math.min(range.rows, Math.max(0, info.rows - range.row)) }, (_, r) => <div role="row" aria-rowindex={range.row + r + 1} key={r}>
          <div className="absolute border-b border-r border-line bg-chip px-2 py-1 text-right text-fg3" style={{ left: 0, top: HEADER + (range.row + r) * ROW, width: GUTTER, height: ROW }}>{range.row + r + 1}</div>
          {Array.from({ length: Math.min(range.columns, Math.max(0, info.columns - range.column)) }, (_, c) => {
            const value = cells?.values[r]?.[c] ?? ''
            return <div role="gridcell" aria-colindex={range.column + c + 1} key={c} title={value} className="absolute truncate border-b border-r border-line px-2 py-1 select-text" style={{ left: GUTTER + (range.column + c) * COL, top: HEADER + (range.row + r) * ROW, width: COL, height: ROW }}>{value}</div>
          })}
        </div>)}
      </div>}
    </div>
    <p className="shrink-0 border-t border-line px-3 py-1 text-[11px] text-fg3">只读预览 · 公式显示文件中的缓存结果</p>
  </div>
}
