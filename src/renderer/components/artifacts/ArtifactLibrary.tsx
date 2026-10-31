import { useEffect, useState } from 'react'
import type { LocalArtifact } from '@shared/artifacts'
import { useArtifacts } from '../../artifactStore'
import { useDesk } from '../../store'
import { useLayout } from '../../layoutStore'
import { FilePreview } from '../files/FilePreview'
function useArtifactList(active = true) {
  const state = useArtifacts()
  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void useArtifacts.getState().load(), 100)
    }
    const off = window.desk.artifacts.onChanged(refresh)
    void useArtifacts.getState().load()
    window.addEventListener('focus', refresh)
    return () => {
      off()
      clearTimeout(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [active])
  return state
}
function sourceTitle(sessionId: string): string {
  const state = useDesk.getState()
  return (
    Object.values(state.sessions)
      .flat()
      .find((s) => s.id === sessionId)?.title ?? sessionId.slice(0, 8)
  )
}
function ArtifactActions({ item }: { item: LocalArtifact }) {
  const act = useArtifacts((s) => s.act)
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-fg3">
      <button className="hover:text-accent" onClick={() => void act(() => window.desk.artifacts.export(item.id))}>
        另存副本
      </button>
      <button className="hover:text-accent" onClick={() => void act(() => window.desk.artifacts.relocate(item.id))}>
        重新定位
      </button>
      <button className="hover:text-danger" onClick={() => void act(() => window.desk.artifacts.remove(item.id))}>
        从目录移除
      </button>
    </div>
  )
}
export function SessionArtifacts({ sessionId, cwd, active }: { sessionId: string; cwd: string; active: boolean }) {
  const { value, error, act } = useArtifactList(active)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (active) void act(() => window.desk.artifacts.collect(sessionId, cwd))
  }, [active, sessionId, cwd, act])
  const items = value.items.filter((item) => item.sources.some((s) => s.sessionId === sessionId))
  return (
    <section className="border-b border-line py-4">
      <div className="flex items-center gap-3">
        <button
          className="min-w-0 flex-1 text-left text-sm font-medium"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? '⌄' : '›'} 本地产物 · {items.length}
        </button>
        <button
          className="text-xs text-accent"
          onClick={() => void act(() => window.desk.artifacts.pick(sessionId, cwd))}
        >
          手动加入
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      {open && (
        <>
          <p className="mt-2 text-xs text-fg3">来自可靠文件操作或明确交付链接；未记录的命令产物请手动加入。</p>
          {items.map((item) => (
            <div key={item.id} className="border-b border-line py-3 last:border-0">
              <button
                className="break-all text-left text-sm text-accent"
                onClick={() => useLayout.getState().openFile(item.path)}
              >
                {item.name}
              </button>
              {item.missing && <p className="text-xs text-danger">文件已移动、删除或不可读</p>}
              <ArtifactActions item={item} />
            </div>
          ))}
        </>
      )}
    </section>
  )
}
export function ArtifactLibrary() {
  const { value, error } = useArtifactList()
  const { projects, sessions, setView } = useDesk()
  const [query, setQuery] = useState(''),
    [project, setProject] = useState(''),
    [session, setSession] = useState(''),
    [type, setType] = useState(''),
    [selected, setSelected] = useState<string | null>(null)
  const types = [...new Set(value.items.map((i) => i.type))].sort()
  const sourceIds = [
    ...new Set(
      value.items.flatMap((item) => item.sources.filter((s) => !project || s.cwd === project).map((s) => s.sessionId))
    )
  ]
  const items = value.items.filter(
    (item) =>
      item.name.toLowerCase().includes(query.toLowerCase()) &&
      (!type || item.type === type) &&
      item.sources.some((s) => (!project || s.cwd === project) && (!session || s.sessionId === session))
  )
  const current = items.find((i) => i.id === selected)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="space-y-3 border-b border-line px-5 pb-4">
        <h1 className="text-lg font-medium">本地产物</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <input
            aria-label="搜索产物"
            placeholder="搜索文件名"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded border border-line bg-bg px-2 py-1.5"
          />
          <select
            aria-label="按项目筛选产物"
            value={project}
            onChange={(e) => {
              setProject(e.target.value)
              setSession('')
            }}
            className="rounded bg-chip px-2"
          >
            <option value="">全部项目</option>
            {[...new Set(value.items.flatMap((i) => i.sources.map((s) => s.cwd)))].map((cwd) => (
              <option key={cwd} value={cwd}>
                {projects.find((p) => p.path === cwd)?.name ?? cwd}
              </option>
            ))}
          </select>
          <select
            aria-label="按来源会话筛选产物"
            value={session}
            onChange={(e) => setSession(e.target.value)}
            className="max-w-48 rounded bg-chip px-2"
          >
            <option value="">全部会话</option>
            {sourceIds.map((id) => (
              <option key={id} value={id}>
                {sourceTitle(id)}
              </option>
            ))}
          </select>
          <select
            aria-label="按文件类型筛选产物"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded bg-chip px-2"
          >
            <option value="">全部类型</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t || '其他'}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-fg3">显示文件当前内容，不保存历史版本。可在会话详情中手动加入产物。</p>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </header>
      <div className="flex min-h-0 flex-1">
        <div className={`${current ? 'w-[300px] shrink-0 border-r border-line' : 'w-full'} overflow-y-auto p-4`}>
          {items.length === 0 && <p className="p-5 text-sm text-fg3">暂无符合条件的产物</p>}
          {items.map((item) => (
            <article
              key={item.id}
              className={`mb-3 rounded-xl border border-line p-3 ${current?.id === item.id ? 'bg-active' : ''}`}
            >
              <button
                className="break-all text-left text-sm font-medium hover:text-accent"
                onClick={() => setSelected(item.id)}
              >
                {item.name}
              </button>
              <p className="mt-1 break-all text-[11px] text-fg3">{item.path}</p>
              {item.missing && <p className="mt-1 text-xs text-danger">文件已移动、删除或不可读</p>}
              <div className="mt-2 space-y-1">
                {item.sources.map((source) => {
                  const p = projects.find((p) => p.path === source.cwd)
                  const available = p && sessions[p.id]?.some((s) => s.id === source.sessionId)
                  return (
                    <div key={source.sessionId} className="text-xs text-fg3">
                      <button
                        disabled={!available}
                        className="max-w-full truncate text-left enabled:hover:text-accent"
                        onClick={() => p && setView({ kind: 'session', sessionId: source.sessionId, projectId: p.id })}
                      >
                        {sourceTitle(source.sessionId)}
                      </button>
                      <span className="ml-2">
                        {{ manual: '手动加入', 'file-tool': '文件操作', 'delivery-link': '交付链接' }[source.evidence]}
                      </span>
                    </div>
                  )
                })}
              </div>
              <ArtifactActions item={item} />
            </article>
          ))}
        </div>
        {current && (
          <div className="flex min-w-0 flex-1 flex-col">
            <button className="self-end px-3 py-1 text-xs text-fg3" onClick={() => setSelected(null)}>
              关闭预览
            </button>
            <div className="min-h-0 flex-1">
              <FilePreview key={current.path} path={current.path} nonce={0} cwd={current.sources[0]?.cwd} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
