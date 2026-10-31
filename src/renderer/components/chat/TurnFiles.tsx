import { useState } from 'react'
import { FileDiff } from 'lucide-react'
import type { UiMessage } from '@shared/chat'
import { collectFileChanges } from '@shared/fileChanges'
import { relativePath } from '@shared/fileLinks'
import { useLayout } from '../../layoutStore'
import { LineStats } from '../files/LineStats'

const PREVIEW = 4

/** 一轮结束后的改动文件卡片：点文件在右栏打开完整内容 */
export function TurnFiles({ messages, cwd }: { messages: UiMessage[]; cwd?: string }) {
  const changes = collectFileChanges(messages)
  const [all, setAll] = useState(false)
  if (changes.length === 0) return null

  const open = (path: string): void => useLayout.getState().openFile(path)
  const added = changes.reduce((n, c) => n + c.added, 0)
  const removed = changes.reduce((n, c) => n + c.removed, 0)
  const name = (path: string): string => relativePath(path, cwd).split('/').pop() ?? path
  const shown = all ? changes : changes.slice(0, PREVIEW)

  return (
    <div className="animate-fade-up my-3 overflow-hidden rounded-xl border border-line bg-card shadow-card">
      <button
        type="button"
        onClick={() => open(changes[0]!.path)}
        className="group flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] hover:bg-hover"
      >
        <FileDiff size={14} className="shrink-0 text-fg3" />
        <span className="min-w-0 truncate font-medium">
          {changes.length === 1 ? `已编辑 ${name(changes[0]!.path)}` : `已编辑 ${changes.length} 个文件`}
        </span>
        <LineStats added={added} removed={removed} />
        <span className="ml-auto shrink-0 text-[12px] text-fg3 opacity-0 transition-opacity group-hover:opacity-100">在右栏打开</span>
      </button>
      {changes.length > 1 && (
        <div className="border-t border-line py-1">
          {shown.map((c) => (
            <button
              key={c.path}
              type="button"
              title={c.path}
              onClick={() => open(c.path)}
              className="flex w-full items-center gap-2 px-3.5 py-1 text-left text-[12.5px] text-fg2 hover:bg-hover hover:text-fg"
            >
              <span className="min-w-0 flex-1 truncate">{relativePath(c.path, cwd)}</span>
              <LineStats added={c.added} removed={c.removed} />
            </button>
          ))}
          {changes.length > PREVIEW && (
            <button type="button" onClick={() => setAll(!all)} className="px-3.5 py-1 text-[12px] text-fg3 hover:text-fg2">
              {all ? '收起' : `还有 ${changes.length - PREVIEW} 个文件`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
