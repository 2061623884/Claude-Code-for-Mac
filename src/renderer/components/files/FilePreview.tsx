import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, FolderOpen } from 'lucide-react'
import { fileName, relativePath } from '@shared/fileLinks'
import { formatBytes } from '@shared/format'
import type { FilePreview as Preview } from '@shared/types'
import { highlightLines, type Token } from '../../highlight'
import { IconButton } from '../sidebar/SessionRow'
import { Markdown } from '../chat/Markdown'
import { FileContext } from './FileLink'
import { PdfPreview } from './PdfPreview'

/** 右栏的文件预览：代码高亮带行号、Markdown 渲染、图片；文件变了自动刷新 */
export function FilePreview({ path, line, nonce, cwd }: { path: string; line?: number; nonce: number; cwd?: string }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const isMarkdown = /\.(md|markdown|mdx)$/i.test(path)
  const isHtml = /\.(html?|xhtml)$/i.test(path)
  const [source, setSource] = useState(!(isMarkdown || isHtml) || Boolean(line))
  useEffect(() => { if (line) setSource(true) }, [line, nonce])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let stale = false
    window.desk.files.read(path).then(
      (p) => !stale && (setPreview(p), setError(null)),
      (err: Error) => !stale && setError(err.message)
    )
    return () => {
      stale = true
    }
  }, [path, tick])

  // 预览期间文件被改动（比如 Claude 刚编辑过）就重新读取
  useEffect(() => {
    void window.desk.files.watch(path).catch(() => {})
    const off = window.desk.files.onChanged((p) => p === path && setTick((t) => t + 1))
    return () => {
      off()
      void window.desk.files.unwatch(path).catch(() => {})
    }
  }, [path])

  const dir = path.slice(0, path.lastIndexOf('/'))

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-line pr-2 pb-1.5 pl-4">
        <span title={path} className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg3">
          {relativePath(path, cwd)}
        </span>
        {(isMarkdown || isHtml) && preview?.kind === 'text' && (
          <div className="mr-1 flex shrink-0 rounded-md bg-chip p-0.5 text-[11.5px]">
            {(['预览', '源码'] as const).map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => setSource(i === 1)}
                className={`rounded px-1.5 py-px ${source === (i === 1) ? 'bg-card text-fg shadow-sm' : 'text-fg3 hover:text-fg2'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <IconButton label="用默认应用打开" onClick={() => void window.desk.files.open(path).catch(() => {})}>
          <ExternalLink size={13} />
        </IconButton>
        <IconButton label="在 Finder 中显示" onClick={() => void window.desk.projects.revealInFinder(path)}>
          <FolderOpen size={13} />
        </IconButton>
        <IconButton
          label={copied ? '已复制' : '复制路径'}
          onClick={() => {
            void navigator.clipboard.writeText(path)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <Note>读取失败：{error}</Note>
        ) : !preview ? (
          <Note>读取中…</Note>
        ) : preview.kind === 'text' ? (
          isHtml && !source ? (
            <iframe title={fileName(path)} sandbox="" srcDoc={'<meta http-equiv="Content-Security-Policy" content="default-src '+"'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;"+'">' + preview.content} className="h-full w-full border-0 bg-white" />
          ) : isMarkdown && !source ? (
            <FileContext.Provider value={{ cwd: dir }}>
              <div className="px-5 py-4">
                <Markdown text={preview.content} />
              </div>
            </FileContext.Provider>
          ) : (
            <CodeLines code={preview.content} path={path} line={line} nonce={nonce} />
          )
        ) : preview.kind === 'pdf' ? (
          <PdfPreview base64={preview.base64} />
        ) : preview.kind === 'image' ? (
          <div className="flex min-h-full items-center justify-center p-4">
            <img src={preview.dataUrl} alt={fileName(path)} className="max-w-full rounded-md shadow-card" />
          </div>
        ) : (
          <div className="px-6 pt-10 text-center text-[13px] text-fg3">
            {preview.kind === 'missing' && '文件不存在或已被删除。'}
            {preview.kind === 'dir' && '这是一个文件夹。'}
            {preview.kind === 'binary' && `无法预览这类文件（${formatBytes(preview.size)}）。`}
            {preview.kind === 'too-large' && `文件太大，不在这里预览（${formatBytes(preview.size)}）。`}
            {(preview.kind === 'binary' || preview.kind === 'too-large') && (
              <button
                type="button"
                onClick={() => void window.desk.files.open(path).catch(() => {})}
                className="mx-auto mt-3 flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-fg2 hover:bg-hover"
              >
                <ExternalLink size={13} />
                用默认应用打开
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3 text-[13px] text-fg3">{children}</div>
}

/** 带行号的代码；指定了行号时高亮那一行并滚过去 */
function CodeLines({ code, path, line, nonce }: { code: string; path: string; line?: number; nonce: number }) {
  const [lines, setLines] = useState<Token[][]>(() => code.split('\n').map((l) => [{ content: l }]))
  const target = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let stale = false
    setLines(code.split('\n').map((l) => [{ content: l }]))
    void highlightLines(code, path).then((l) => !stale && setLines(l))
    return () => {
      stale = true
    }
  }, [code, path])

  useLayoutEffect(() => {
    target.current?.scrollIntoView({ block: 'center' })
  }, [line, nonce])

  const width = String(lines.length).length
  return (
    <div className="code-lines min-w-fit py-2 font-mono text-[12px] leading-[1.6] select-text">
      {lines.map((tokens, i) => {
        const n = i + 1
        const hit = n === line
        return (
          <div key={i} ref={hit ? target : undefined} className={`flex ${hit ? 'bg-accent/12' : ''}`}>
            <span style={{ width: `${width + 2}ch` }} className="shrink-0 pr-3 text-right text-fg3/70 select-none">
              {n}
            </span>
            <span className="pr-4 whitespace-pre">
              {tokens.map((t, j) => (
                <span key={j} style={t.style}>
                  {t.content}
                </span>
              ))}
              {tokens.length === 0 && ' '}
            </span>
          </div>
        )
      })}
    </div>
  )
}
