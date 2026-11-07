import { useComposerDrafts } from '../../composerDraftStore'
import { useEffect, useRef, useState } from 'react'
import { Ellipsis, FileClock, Files, GitBranch } from 'lucide-react'
import type { UiMessage } from '@shared/chat'
import type { FileRewindResult } from '@shared/sessionControl'
import { useDesk } from '../../store'
import { useChat } from '../../chatStore'

export function RestoreMessage({ message }: { message: UiMessage }) {
  const view = useDesk(s => s.view)
  const chat = useChat(s => view.kind === 'session' ? s.chats[view.sessionId] : undefined)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<FileRewindResult>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmFiles, setConfirmFiles] = useState<'files' | 'both' | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  if (view.kind !== 'session' || !chat || message.forkFrom === undefined) return null
  const sessionId = view.sessionId
  const project = useDesk.getState().projects.find(p => p.id === chat.projectId)
  if (!project) return null
  async function show() {
    setPreview(undefined); setConfirmFiles(null); setOpen(true); setBusy(true); setError('')
    try { setPreview(await window.desk.chat.rewindPreview(sessionId, project!.path, message.uuid ?? message.id)) }
    catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }
  async function restore(files: boolean, conversation: boolean) {
    setBusy(true); setError('')
    let filesRestored = false
    try {
      if (files) {
        const result = await window.desk.chat.rewindFiles(sessionId, project!.path, message.uuid ?? message.id)
        if (!result.canRewind || result.skippedLinks) throw new Error(result.error ?? '部分文件未恢复，请检查文件状态')
        filesRestored = true
      }
      if (conversation) {
        const id = await window.desk.chat.restoreConversation(sessionId, project!.path, message.id)

        useComposerDrafts.getState().updateDraft(id, { text: message.blocks.filter(b => b.kind === 'text').map(b => b.text).join('\n') })
        useDesk.getState().addPendingSession(project!.id, id, '恢复的对话')
        useDesk.getState().setView({ kind: 'session', sessionId: id, projectId: project!.id })
      }
      setOpen(false)
    } catch (e) { setError((filesRestored ? '文件已恢复，对话分支未完成。' : '') + String(e)) }
    finally { setBusy(false) }
  }
  const actions = [
    { label: '仅恢复对话', Icon: GitBranch, files: false, conversation: true },
    { label: '仅恢复文件', Icon: FileClock, files: true, conversation: false },
    { label: '同时恢复', Icon: Files, files: true, conversation: true }
  ]
  return <div ref={root} className="relative">
    <button ref={trigger} type="button" title="更多" aria-label="更多" aria-expanded={open}
      disabled={chat.state !== 'idle' || (busy && !open)}
      onClick={() => open ? setOpen(false) : void show()}
      className="flex size-7 items-center justify-center rounded-md text-fg3 hover:bg-hover hover:text-fg disabled:opacity-40">
      <Ellipsis size={14} />
    </button>
    {open && <div role="group" aria-label="恢复操作" className="absolute right-0 top-full z-20 mt-1 rounded-xl border border-line bg-card p-1 shadow-card">
      {confirmFiles ? <div className="w-72 max-w-[80vw] p-2 text-sm">
        <p>恢复文件会覆盖当前工作区中的对应文件。</p>
        {Array.isArray(preview?.filesChanged) ? <ul className="mt-2 max-h-36 overflow-auto break-all text-xs text-fg2">
          {preview.filesChanged.length ? preview.filesChanged.map((file: string) => <li key={file}>{file}</li>) : <li>预览中没有文件变更</li>}
        </ul> : <p className="mt-2 text-xs text-fg2">无法获取受影响文件列表</p>}
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={busy || chat.state !== 'idle'} onClick={() => void restore(true, confirmFiles === 'both')} className="rounded-md bg-accent px-3 py-1 text-card disabled:opacity-40">确认恢复文件</button>
          <button type="button" disabled={busy} onClick={() => setConfirmFiles(null)} className="rounded-md px-3 py-1 hover:bg-hover">取消</button>
        </div>
      </div> : <>
      <div className="flex gap-1">
        {actions.map(({ label, Icon, files, conversation }) =>
          <span key={label} className="group/action relative">
            <button type="button" aria-label={label} disabled={busy || chat.state !== 'idle' || (files && !preview?.canRewind)}
              onClick={() => files ? setConfirmFiles(conversation ? 'both' : 'files') : void restore(false, true)}
              className="flex size-8 items-center justify-center rounded-lg text-fg2 hover:bg-hover disabled:opacity-40">
              <Icon size={15} />
            </button>
            <span aria-hidden="true" className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden whitespace-nowrap rounded-md bg-fg px-2 py-1 text-xs text-card group-hover/action:block group-focus-within/action:block">{label}</span>
          </span>
        )}
      </div>
      </>}
      {error && <p role="alert" className="w-52 break-words p-2 text-xs text-danger">{error}</p>}
    </div>}
  </div>
}
