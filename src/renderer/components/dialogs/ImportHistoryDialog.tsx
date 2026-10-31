import { useState } from 'react'
import type { DetectedFolder } from '@shared/types'
import { shortenPath } from '@shared/format'
import { useDesk } from '../../store'
import { Button, Dialog } from '../ui/Dialog'

export function ImportHistoryDialog({ candidates }: { candidates: DetectedFolder[] }) {
  const { home, importProjects } = useDesk()
  const [selected, setSelected] = useState(() => new Set(candidates.map((c) => c.path)))

  const toggle = (path: string): void => {
    const next = new Set(selected)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setSelected(next)
  }

  return (
    <Dialog
      title="发现历史会话"
      width={480}
      onClose={() => void importProjects([])}
      footer={
        <>
          <Button onClick={() => void importProjects([])}>跳过</Button>
          <Button variant="primary" disabled={selected.size === 0} onClick={() => void importProjects([...selected])}>
            导入所选（{selected.size}）
          </Button>
        </>
      }
    >
      <p>以下文件夹里有你用 Claude Code 进行过的对话。勾选的文件夹会添加为项目：</p>
      <div className="mt-3 flex flex-col gap-1">
        {candidates.map((c) => (
          <label key={c.path} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-hover">
            <input type="checkbox" checked={selected.has(c.path)} onChange={() => toggle(c.path)} className="size-4 accent-current" />
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg" title={c.path}>
              {shortenPath(c.path, home)}
            </span>
            <span className="shrink-0 text-[12px] text-fg3">{c.sessionCount} 个对话</span>
          </label>
        ))}
      </div>
    </Dialog>
  )
}
