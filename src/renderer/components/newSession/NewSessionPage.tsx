import { useEffect, useRef, useState } from 'react'
import { FolderPlus } from 'lucide-react'
import { attachmentTitle, type ComposerAttachment } from '@shared/attachments'
import { shortenPath } from '@shared/format'
import { captureFirstSend } from '../../motion/firstSend'
import { useDesk } from '../../store'
import { draftSessionOptions } from '../../sessionOptions'
import { useChat } from '../../chatStore'
import { openAppPanel, usePanel } from '../../panelStore'
import { CommandPanel } from '../commands/CommandPanel'
import { Button } from '../ui/Dialog'
import { Composer, EffortChip, ModelChip, PermissionChip, ProjectChip } from './Composer'

export function NewSessionPage() {
  const composerRoot = useRef<HTMLDivElement>(null)
  const transition = useRef<ReturnType<typeof captureFirstSend>>(undefined)
  useEffect(() => () => transition.current?.release(), [])
  const desk = useDesk()
  const { projects, selectedProjectId, home, pickProject, setDraft } = desk
  const options = draftSessionOptions(desk)
  const start = useChat((s) => s.start)
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const project = projects.find((p) => p.id === selectedProjectId)
  const panelOpen = usePanel((s) => s.panel !== null)

  if (projects.length === 0) {
    return (
      <Centered>
        <h1 className="font-serif text-[30px] font-normal tracking-tight">先添加一个项目文件夹</h1>
        <p className="mt-2 text-fg2">Claude 会在你选择的文件夹里阅读代码、修改文件和运行命令。</p>
        <div className="mt-6">
          <Button variant="primary" onClick={() => void pickProject()}>
            <span className="flex items-center gap-1.5">
              <FolderPlus size={15} />
              添加项目…
            </span>
          </Button>
        </div>
      </Centered>
    )
  }

  return (
    <Centered>
      <h1 className="font-serif text-[30px] font-normal tracking-tight">{desk.greeting}</h1>
      <p className="mt-1.5 truncate text-fg3">
        {project ? (
          <>
            在 <span className="font-medium text-fg2">{project.name}</span> 中 · {shortenPath(project.path, home)}
          </>
        ) : (
          '请先选择一个项目'
        )}
      </p>
      <div ref={composerRoot} className="relative mt-2">
        <Composer
          sessionState={error ? 'error' : sending ? 'running' : 'idle'}
          value={text}
          onChange={setText}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          autoFocus
          cwd={project?.path}
          panel={
            panelOpen && (
              <CommandPanel
                ctx={{
                  sessionId: null,
                  cwd: project?.path,
                  options,
                  setOptions: (patch) => setDraft(patch)
                }}
              />
            )
          }
          onCommand={openAppPanel}
          onSubmit={async ({ text: body, prompt, attachments: submitted }) => {
            transition.current = captureFirstSend(composerRoot.current)
            setSending(true)
            setError(null)
            try {
              await start(prompt, attachmentTitle(body, submitted), transition.current?.arm)
            } catch (err) {
              transition.current?.cancel()
              setError(err instanceof Error ? err.message : String(err))
              throw err
            } finally {
              setSending(false)
            }
          }}
          canSubmit={Boolean(project && !sending)}
          submitHint={project ? '发送（Enter）' : '请先选择项目'}
          chips={
            <>
              <ProjectChip />
              <ModelChip value={options.model} onChange={(model) => setDraft({ model })} />
              <EffortChip model={options.model} value={options.effort} onChange={(effort) => setDraft({ effort })} />
              <PermissionChip value={options.mode} onChange={(mode) => setDraft({ mode })} />
            </>
          }
        />
        {error && <p className="mt-2 text-[12.5px] text-danger">发送失败：{error}</p>}
      </div>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-8 pb-[10vh]">
      <div className="w-full max-w-[720px]">{children}</div>
    </div>
  )
}
