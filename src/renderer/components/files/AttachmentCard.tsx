import { useEffect, useState } from 'react'
import { File, FileText, FileSpreadsheet, Presentation, Folder, Image, X } from 'lucide-react'
import { fileName } from '@shared/fileLinks'
import { formatBytes } from '@shared/format'
import { openPath } from './FileLink'

/** Shared visual representation for dropped files, mentions and sent attachments. */
export function AttachmentCard({ path, kind = 'file', line, bytes, onRemove }: {
  path: string
  kind?: 'file' | 'dir'
  line?: number
  bytes?: number
  onRemove?(): void
}) {
  const name = fileName(path)
  const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const isImage = kind === 'file' && /^(png|jpe?g|gif|webp|svg|bmp|ico)$/.test(extension)
  const [preview, setPreview] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    let active = true
    if (isImage) {
      void window.desk.files.read(path).then((result) => {
        if (active && result.kind === 'image') setPreview({ path, url: result.dataUrl })
      }).catch(() => {})
    }
    return () => { active = false }
  }, [path, isImage])
  const url = preview?.path === path ? preview.url : undefined
  const presentation = /^(pptx?|key|odp)$/.test(extension)
  const spreadsheet = /^(xlsx?|csv|ods)$/.test(extension)
  const document = /^(pdf|docx?|txt|md|rtf|odt)$/.test(extension)
  const Icon = kind === 'dir' ? Folder : isImage ? Image : presentation ? Presentation : spreadsheet ? FileSpreadsheet : document ? FileText : File
  const color = presentation ? 'text-orange-600 bg-orange-500/10' : spreadsheet ? 'text-emerald-600 bg-emerald-500/10' : extension === 'pdf' ? 'text-red-600 bg-red-500/10' : 'text-accent bg-accent/10'
  return (
    <span contentEditable={false} className="group/attachment relative my-1 inline-flex max-w-full align-middle whitespace-normal">
      <button
        type="button"
        title={path}
        aria-label={`预览 ${name}`}
        onClick={(event) => openPath(path, kind, line, event.metaKey)}
        className={`flex overflow-hidden rounded-xl border border-line bg-card text-left shadow-sm transition-colors hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent ${isImage && url ? 'w-[160px] flex-col' : 'h-[64px] w-[230px] max-w-full items-center gap-3 px-3'}`}
      >
        {isImage && url ? <img src={url} alt={name} className="h-[104px] w-full bg-chip object-contain" /> : <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${color}`}><Icon size={22} /></span>}
        <span className={`min-w-0 flex-1 ${isImage && url ? 'w-full px-2.5 py-1.5' : 'pr-3'}`}>
          <span className="block truncate text-[12.5px] font-medium text-fg">{name}</span>
          <span className="block truncate text-[10.5px] leading-4 text-fg3">{kind === 'dir' ? '文件夹' : extension.toUpperCase() || '文件'}{bytes !== undefined ? ` · ${formatBytes(bytes)}` : ''}{line ? ` · 第 ${line} 行` : ''}</span>
        </span>
      </button>
      {onRemove && <button type="button" aria-label={`移除 ${name}`} title={`移除 ${name}`} onMouseDown={(event) => event.preventDefault()} onClick={onRemove} className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full border border-line bg-card text-fg3 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"><X size={12} /></button>}
    </span>
  )
}
