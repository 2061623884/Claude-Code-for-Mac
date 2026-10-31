import { Compass, FolderOpen, Globe, Terminal, MessageCircleQuestion } from 'lucide-react'
import type { SidePage } from '../../layoutStore'

export function StartPane({ onSelect, hasProject }: { onSelect(kind: SidePage['kind']): void; hasProject: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-6 py-8">
      <div className="my-auto w-full max-w-[480px] self-center py-8">
        <Compass size={52} strokeWidth={1.5} className="mx-auto mb-9 text-fg3/30" />
        <div className="flex flex-col gap-3">
          {[
            { kind: 'files' as const, label: '工作区文件', description: '浏览会话工作区的文件', icon: <FolderOpen size={22} className="text-amber-400" />, shortcut: '⌘ P' },
            { kind: 'terminal' as const, label: '新建终端', description: '在会话工作区运行命令', icon: <Terminal size={22} className="text-blue-400" />, shortcut: '⌃ `' },
            { kind: 'browser' as const, label: '浏览器', description: '浏览网页', icon: <Globe size={22} className="text-blue-400" />, shortcut: '⌘ T' },
            { kind: 'chat' as const, label: '侧边聊天', description: '基于当前会话，开始独立问答', icon: <MessageCircleQuestion size={22} className="text-blue-400" />, shortcut: '' }
          ].map((item) => (
            <button key={item.kind} type="button" disabled={!hasProject && item.kind !== 'browser'} onClick={() => onSelect(item.kind)}
              className="group flex w-full items-center gap-4 rounded-2xl border border-line-strong px-5 py-4 text-left transition-colors hover:bg-hover disabled:opacity-40">
              <span className="shrink-0">{item.icon}</span>
              <span className="min-w-0 flex-1"><span className="block text-[16px] font-medium">{item.label}</span><span className="mt-1 block text-[12px] text-fg2">{item.description}</span></span>
              <kbd className="shrink-0 text-[11px] text-fg3">{item.shortcut}</kbd>
            </button>
          ))}
        </div>
        {!hasProject && <p className="mt-4 text-center text-[12px] text-fg3">添加项目后即可浏览文件和使用终端。</p>}
      </div>
    </div>
  )
}
