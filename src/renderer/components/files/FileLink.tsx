// 文件链接：文字里的路径渲染成「文件图标 + 文件名」，悬停显示完整路径，点击在右栏打开。
// 只有路径真实存在时才渲染成链接，否则照原样显示（fallback）。
import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Folder } from 'lucide-react'
import { fileName, findBarePaths, resolvePath, type PathRef } from '@shared/fileLinks'
import { useLayout } from '../../layoutStore'
import { usePathKind } from '../../pathKinds'
import { useDesk } from '../../store'

/** 解析相对路径用的项目目录 */
export const FileContext = createContext<{ cwd?: string }>({})

/** 打开文件：普通点击在右栏预览，⌘ 点击用默认应用打开；文件夹在 Finder 中显示 */
export function openPath(path: string, kind: 'file' | 'dir', line?: number, external = false): void {
  if (kind === 'dir') void window.desk.projects.revealInFinder(path)
  else if (external) void window.desk.files.open(path).catch(() => {})
  else useLayout.getState().openFile(path, line)
}

export function FileLink({ pathRef, fallback }: { pathRef: PathRef; fallback: ReactNode }) {
  const { cwd } = useContext(FileContext)
  const home = useDesk((s) => s.home)
  const abs = resolvePath(pathRef.path, cwd, home)
  const kind = usePathKind(abs)
  if (!abs || !kind) return <>{fallback}</>
  return <FileChip path={abs} kind={kind} line={pathRef.line} />
}

/** 文件小组件本身（也用在输入框里） */
export function FileChip({ path, kind, line, onClick }: { path: string; kind: 'file' | 'dir'; line?: number; onClick?(): void }) {
  const [tip, setTip] = useState<DOMRect | null>(null)
  const el = useRef<HTMLAnchorElement>(null)
  const hover = useRef<ReturnType<typeof setTimeout> | null>(null)
  const label = fileName(path) + (line ? `:${line}` : '')
  const Icon = kind === 'dir' ? Folder : FileText

  return (
    <>
      <a
        ref={el}
        href={`file://${path}`}
        onClick={(e) => {
          e.preventDefault()
          setTip(null)
          if (onClick) onClick()
          else openPath(path, kind, line, e.metaKey)
        }}
        onMouseEnter={() => {
          hover.current = setTimeout(() => el.current && setTip(el.current.getBoundingClientRect()), 250)
        }}
        onMouseLeave={() => {
          if (hover.current) clearTimeout(hover.current)
          setTip(null)
        }}
        className="file-link mx-px inline-flex max-w-full items-baseline gap-[3px] align-baseline font-sans text-accent no-underline"
      >
        <Icon size="0.95em" strokeWidth={2} className="shrink-0 self-center" />
        <span className="truncate underline decoration-accent/55 decoration-dashed underline-offset-[3px]">{label}</span>
      </a>
      {tip && createPortal(<Tooltip rect={tip} text={path} />, document.body)}
    </>
  )
}

/** 深色气泡，显示在链接上方居中；放不下时显示在下方 */
function Tooltip({ rect, text }: { rect: DOMRect; text: string }) {
  const below = rect.top < 80
  return (
    <div
      role="tooltip"
      style={{
        left: Math.min(Math.max(rect.left + rect.width / 2, 180), window.innerWidth - 180),
        top: below ? rect.bottom + 8 : rect.top - 8
      }}
      className={`animate-fade-in pointer-events-none fixed z-[100] max-w-[340px] -translate-x-1/2 rounded-xl bg-[#1f1e1d] px-3.5 py-2 text-center text-[12.5px] leading-snug break-all text-white shadow-pop [animation-delay:0s] ${
        below ? '' : '-translate-y-full'
      }`}
    >
      {text}
    </div>
  )
}

/** 普通文字（如用户消息）：其中的绝对路径和 @ 引用渲染成文件链接 */
export function LinkifiedText({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let i = 0
  for (const m of findBarePaths(text)) {
    if (m.start > i) parts.push(text.slice(i, m.start))
    const raw = text.slice(m.start, m.end)
    parts.push(<FileLink key={m.start} pathRef={m.ref} fallback={raw} />)
    i = m.end
  }
  if (i < text.length) parts.push(text.slice(i))
  return <>{parts}</>
}
