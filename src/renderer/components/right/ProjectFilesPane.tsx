import { useEffect, useState } from 'react'
import { ChevronRight, FileText, Folder, FolderOpen, RefreshCw } from 'lucide-react'
import type { ProjectEntry } from '@shared/types'
import { useLayout } from '../../layoutStore'

/** 右栏「项目文件」：按需读取目录，点击文件直接在右栏预览 */
export function ProjectFilesPane({ cwd, refreshKey }: { cwd?: string; refreshKey: number }) {
  const [revision, setRevision] = useState(0)
  if (!cwd) {
    return <div className="px-5 py-6 text-[13px] text-fg3">当前对话没有关联项目。</div>
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-line px-3.5 text-[12px] text-fg3">
        <Folder size={13} className="shrink-0" />
        <span title={cwd} className="min-w-0 flex-1 truncate font-mono">
          {cwd}
        </span>
        <button type="button" aria-label="刷新文件列表" onClick={() => setRevision((v) => v + 1)} className="rounded p-1 hover:bg-hover"><RefreshCw size={13} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        <DirectoryContents key={`${cwd}:${refreshKey}:${revision}`} projectPath={cwd} directory={cwd} depth={0} refreshKey={refreshKey + revision} />
      </div>
    </div>
  )
}

function DirectoryContents({
  projectPath,
  directory,
  depth,
  refreshKey
}: {
  projectPath: string
  directory: string
  depth: number
  refreshKey: number
}) {
  const [entries, setEntries] = useState<ProjectEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    setEntries(null)
    setError(null)
    window.desk.files.list(projectPath, directory).then(
      (next) => !stale && setEntries(next),
      (err: Error) => !stale && setError(err.message)
    )
    return () => {
      stale = true
    }
  }, [projectPath, directory, refreshKey])

  if (error) {
    return <div className="px-4 py-2 text-[12.5px] text-danger">读取失败：{error}</div>
  }
  if (!entries) {
    return <div className="px-4 py-2 text-[12.5px] text-fg3">读取中…</div>
  }
  if (entries.length === 0) {
    return depth > 0 ? null : <div className="px-4 py-2 text-[12.5px] text-fg3">项目文件夹为空。</div>
  }

  return (
    <>
      {entries.map((entry) =>
        entry.kind === 'dir' ? (
          <DirectoryRow
            key={entry.path}
            entry={entry}
            projectPath={projectPath}
            depth={depth}
            refreshKey={refreshKey}
          />
        ) : (
          <button
            key={entry.path}
            type="button"
            aria-label={entry.name}
            title={entry.path}
            onClick={() => useLayout.getState().openFile(entry.path)}
            className="flex h-8 w-full items-center gap-2 pr-3 text-left text-[13px] text-fg2 hover:bg-hover hover:text-fg"
            style={{ paddingLeft: `${14 + depth * 15}px` }}
          >
            <span className="size-3.5 shrink-0" />
            <FileText size={14} className="shrink-0 text-fg3" />
            <span className="truncate">{entry.name}</span>
          </button>
        )
      )}
    </>
  )
}

function DirectoryRow({
  entry,
  projectPath,
  depth,
  refreshKey
}: {
  entry: ProjectEntry
  projectPath: string
  depth: number
  refreshKey: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label={entry.name}
        aria-expanded={open}
        title={entry.path}
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 w-full items-center gap-1.5 pr-3 text-left text-[13px] text-fg2 hover:bg-hover hover:text-fg"
        style={{ paddingLeft: `${8 + depth * 15}px` }}
      >
        <ChevronRight size={13} className={`shrink-0 text-fg3 transition-transform ${open ? 'rotate-90' : ''}`} />
        {open ? <FolderOpen size={14} className="shrink-0 text-fg3" /> : <Folder size={14} className="shrink-0 text-fg3" />}
        <span className="truncate">{entry.name}</span>
      </button>
      {open && (
        <DirectoryContents
          projectPath={projectPath}
          directory={entry.path}
          depth={depth + 1}
          refreshKey={refreshKey}
        />
      )}
    </>
  )
}
