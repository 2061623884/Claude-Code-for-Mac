import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowUp,
  Box,
  Brain,
  ChevronDown,
  FilePlus2,
  Folder,
  FolderPlus,
  Plus,
  Shield,
  Square,
  X
} from 'lucide-react'
import {
  buildPrompt,
  mergeAttachments,
  referenceFor,
  type ComposerAttachment,
  type ComposerSubmission
} from '@shared/attachments'
import type { CommandInfo, EffortLevel, PermissionMode } from '@shared/types'
import { EFFORT_LEVELS, findTrigger, formatBytes, PERMISSION_MODES, shortenPath, type Trigger } from '@shared/format'
import { useDesk } from '../../store'
import { Menu } from '../ui/Menu'
import { ComposerEditor, type EditorHandle } from './ComposerEditor'

interface ComposerProps {
  value: string
  onChange(value: string): void
  attachments: ComposerAttachment[]
  onAttachmentsChange(next: ComposerAttachment[]): void
  onSubmit(submission: ComposerSubmission): Promise<void>
  /** 页面是否已准备好接收消息；正文或附件至少有一项时才真正可发送 */
  canSubmit: boolean
  submitHint: string
  chips: ReactNode
  rows?: number
  placeholder?: string
  /** 运行中且输入框为空时，发送按钮变成停止按钮 */
  running?: boolean
  onStop?(): void
  autoFocus?: boolean
  /** 项目文件夹：用于 / 命令和 @ 文件建议 */
  cwd?: string
  /** 显示在发送按钮左边（如上下文占用） */
  meter?: ReactNode
  /** 应用自己实现、SDK 里没有的命令，排在命令菜单最前面 */
  extraCommands?: CommandInfo[]
  /** 输入框上方的浮层（命令面板），打开时盖住建议列表 */
  panel?: ReactNode
  /** 应用自己处理的命令（从菜单选中或直接回车）：返回 true 表示已处理，不再作为消息发送 */
  onCommand?(name: string, args: string): boolean
}

export function Composer({
  value,
  onChange,
  attachments,
  onAttachmentsChange,
  onSubmit,
  canSubmit,
  submitHint,
  chips,
  rows = 3,
  placeholder = '描述你的任务，输入 / 使用命令，@ 引用文件',
  running = false,
  onStop,
  autoFocus,
  cwd,
  meter,
  extraCommands,
  panel,
  onCommand
}: ComposerProps) {
  const editor = useRef<EditorHandle>(null)
  const home = useDesk((s) => s.home)
  const fileInput = useRef<HTMLInputElement>(null)
  const showStop = running && !value.trim() && attachments.length === 0 && onStop
  // 光标前后的文字（文件小组件换成占位符），用来识别 / 命令和 @ 补全
  const [cursor, setCursor] = useState({ text: value, caret: value.length })
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [burst, setBurst] = useState(0)
  const valueRef = useRef(value)
  const attachmentsRef = useRef(attachments)
  valueRef.current = value
  attachmentsRef.current = attachments
  const trigger = findTrigger(cursor.text, cursor.caret)
  const suggest = useSuggestions(trigger, cwd, extraCommands)
  const canSend = canSubmit && Boolean(value.trim() || attachments.length) && !submitting

  const pick = (item: Suggestion): void => {
    if (!trigger) return
    // 应用自己处理的命令：选中即执行，把命令从输入框里拿掉
    const length = cursor.caret - trigger.start
    if (trigger.kind === '/' && onCommand?.(item.key, '')) {
      editor.current?.replaceBeforeCaret(length, { text: '' })
      return
    }
    // @ 选中的文件插成文件小组件，/ 命令插入命令文字
    if (trigger.kind === '@' && cwd) editor.current?.replaceBeforeCaret(length, { file: `${cwd.replace(/\/$/, '')}/${item.key}` })
    else editor.current?.replaceBeforeCaret(length, { text: item.insert + ' ' })
  }

  const onKey = (e: KeyboardEvent): boolean => {
    if (suggest.open) {
      const n = suggest.items.length
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        suggest.setActive((suggest.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
        return true
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        pick(suggest.items[suggest.active])
        return true
      }
      if (e.key === 'Escape') {
        suggest.dismiss()
        return true
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (canSend) void submit()
      return true
    }
    return false
  }

  const triggerBurst = (): void => setBurst((value) => value + 1)

  const addFiles = useCallback(
    async (files: File[]): Promise<void> => {
      if (files.length === 0) return
      setAdding(true)
      try {
        const paths = [
          ...new Set(
            files
              .map((file) => window.desk.files.pathFor(file))
              .filter((path) => path !== '')
          )
        ]
        if (paths.length === 0) return
        const infos = await window.desk.files.describe(paths)
        if (infos.length === 0) return
        const current = attachmentsRef.current
        const next = mergeAttachments(current, infos)
        if (next.length === current.length) return
        attachmentsRef.current = next
        onAttachmentsChange(next)
        triggerBurst()
      } catch {
        // 文件读取失败时保持现有草稿不变
      } finally {
        setAdding(false)
      }
    },
    [onAttachmentsChange]
  )

  // 文件拖过窗口任意位置时都提示可放入当前 Composer；普通文本拖拽保持原生行为
  useEffect(() => {
    let depth = 0
    const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes('Files')
    const reset = (): void => {
      depth = 0
      setDragging(false)
    }
    const onDragEnter = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth += 1
      setDragging(true)
    }
    const onDragOver = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
      reset()
      const items = Array.from(event.dataTransfer?.items ?? [])
      const dropped = items.length
        ? items.flatMap((item) => {
            if (item.kind !== 'file') return []
            const entry = item.webkitGetAsEntry?.()
            if (entry && !entry.isFile) return []
            const file = item.getAsFile()
            return file ? [file] : []
          })
        : Array.from(event.dataTransfer?.files ?? [])
      void addFiles(dropped)
    }
    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    window.addEventListener('dragend', reset)
    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', reset)
    }
  }, [addFiles])

  const submit = async (): Promise<void> => {
    if (!canSend) return
    const cmd = attachments.length === 0 ? /^\/(\S+)\s*([\s\S]*)$/.exec(value.trim()) : null
    if (cmd && onCommand?.(cmd[1], cmd[2].trim())) {
      valueRef.current = ''
      onChange('')
      return
    }
    const submission: ComposerSubmission = {
      text: value.trim(),
      prompt: buildPrompt(value, attachments, cwd),
      attachments
    }
    setSubmitting(true)
    try {
      await onSubmit(submission)
      const submittedPaths = new Set(submission.attachments.map((file) => file.path))
      const currentAttachments = attachmentsRef.current
      const remaining = currentAttachments.filter((file) => !submittedPaths.has(file.path))
      if (remaining.length !== currentAttachments.length) {
        attachmentsRef.current = remaining
        onAttachmentsChange(remaining)
      }
      if (valueRef.current.trim() === submission.text) {
        valueRef.current = ''
        onChange('')
      }
    } catch {
      // 调用方负责展示错误；失败时保留正文和附件
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative">
      {panel}
      {suggest.open && !panel && <SuggestionList items={suggest.items} active={suggest.active} onPick={pick} onHover={suggest.setActive} />}
      <div className="relative rounded-[20px] border border-line-strong bg-card shadow-card transition-colors focus-within:border-accent/45">
        {attachments.length > 0 && (
          <AttachmentRail
            attachments={attachments}
            cwd={cwd}
            onRemove={(path) => {
              const next = attachmentsRef.current.filter((file) => file.path !== path)
              attachmentsRef.current = next
              onAttachmentsChange(next)
            }}
          />
        )}
        <ComposerEditor
          editorRef={editor}
          value={value}
          rows={rows}
          autoFocus={autoFocus}
          placeholder={placeholder}
          cwd={cwd}
          home={home}
          onChange={(next, text, caret) => {
            setCursor({ text, caret })
            if (next === valueRef.current) return
            valueRef.current = next
            onChange(next)
          }}
          onKey={onKey}
        />
        <div className="flex items-center gap-1 px-2.5 pb-2.5">
          <button
            type="button"
            title="添加文件"
            aria-label="添加文件"
            disabled={submitting}
            onClick={() => {
              triggerBurst()
              fileInput.current?.click()
            }}
            className="composer-add-button relative flex size-7 shrink-0 items-center justify-center rounded-full text-fg2 disabled:opacity-40"
          >
            <Plus size={15} />
            {attachments.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-accent text-[9px] font-medium leading-none text-accent-fg">
                {attachments.length > 9 ? '9+' : attachments.length}
              </span>
            )}
            {burst > 0 && <span key={burst} className="composer-add-burst" />}
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? [])
              event.currentTarget.value = ''
              void addFiles(files)
            }}
          />
          {/* 窄窗口下选择器折行，不把发送按钮挤出去 */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">{chips}</div>
          {meter}
          {showStop ? (
            <button
              type="button"
              title="停止"
              aria-label="停止"
              onClick={onStop}
              className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-fg hover:opacity-85"
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              title={submitHint}
              aria-label="发送"
              disabled={!canSend}
              onClick={() => {
                void submit()
              }}
              className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-fg transition-opacity hover:opacity-85 disabled:opacity-25"
            >
              <ArrowUp size={17} strokeWidth={2.2} />
            </button>
          )}
        </div>
        {dragging && (
          <div
            role="status"
            className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-accent bg-card/95 text-center backdrop-blur-sm"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-accent/10 text-accent">
              <FilePlus2 size={18} />
            </span>
            <span className="mt-2 text-[13px] font-medium">松开以添加文件</span>
            <span className="mt-0.5 text-[11.5px] text-fg3">支持多选，文件将作为路径引用</span>
          </div>
        )}
      </div>
      {adding && <div className="pointer-events-none absolute bottom-2 left-11 text-[11px] text-fg3">正在读取文件…</div>}
    </div>
  )
}

function AttachmentRail({
  attachments,
  cwd,
  onRemove
}: {
  attachments: ComposerAttachment[]
  cwd?: string
  onRemove(path: string): void
}) {
  return (
    <div
      role="list"
      aria-label="已添加文件"
      className="flex gap-2 overflow-x-auto px-3 pb-1 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {attachments.map((file) => (
        <div
          key={file.path}
          role="listitem"
          title={file.path}
          className="group/file flex h-12 min-w-[190px] max-w-[250px] items-center gap-2.5 rounded-lg border border-line bg-chip/60 px-2.5"
        >
          <span className="flex size-8 shrink-0 flex-col items-center justify-center rounded-md bg-card font-mono text-[9px] font-semibold uppercase text-fg2 shadow-sm">
            {file.extension.slice(0, 4) || 'FILE'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium text-fg">{file.name}</span>
            <span className="mt-0.5 block truncate text-[10.5px] text-fg3">
              {referenceFor(file.path, cwd).slice(1)} · {formatBytes(file.bytes)}
            </span>
          </span>
          <button
            type="button"
            title={`移除 ${file.name}`}
            aria-label={`移除 ${file.name}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onRemove(file.path)}
            className="flex size-5 shrink-0 items-center justify-center rounded-full text-fg3 opacity-0 transition-opacity hover:bg-hover hover:text-fg group-hover/file:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

interface Suggestion {
  key: string
  label: string
  hint?: string
  detail?: string
  insert: string
}

const NO_COMMANDS: CommandInfo[] = []

// 命令列表按项目缓存，整个应用共用
const commandCache = new Map<string, Promise<CommandInfo[]>>()
function loadCommands(cwd: string): Promise<CommandInfo[]> {
  let p = commandCache.get(cwd)
  if (!p) {
    p = window.desk.meta.commands(cwd).catch((err) => {
      commandCache.delete(cwd)
      throw err
    })
    commandCache.set(cwd, p)
  }
  return p
}

function matchCommands(commands: CommandInfo[], query: string): Suggestion[] {
  const q = query.toLowerCase()
  return commands
    .filter((c) => c.name.toLowerCase().includes(q))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
    .map((c) => ({ key: c.name, label: '/' + c.name, hint: c.argumentHint || undefined, detail: c.description, insert: '/' + c.name }))
}

function useSuggestions(trigger: Trigger | null, cwd: string | undefined, extra: CommandInfo[] = NO_COMMANDS) {
  const [items, setItems] = useState<Suggestion[]>([])
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const id = trigger && `${trigger.kind}${trigger.start}`
  const kind = trigger?.kind
  const query = trigger?.query

  useEffect(() => {
    if (!kind || query === undefined || !cwd) return setItems([])
    let stale = false
    const load: Promise<Suggestion[]> =
      kind === '/'
        ? loadCommands(cwd).then((cmds) => matchCommands([...extra, ...cmds], query))
        : window.desk.files.search(cwd, query).then((files) => files.map((f) => ({ key: f, label: f, insert: '@' + f })))
    load
      .then((next) => {
        if (stale) return
        setItems(next)
        setActive(0)
      })
      .catch(() => !stale && setItems([]))
    return () => {
      stale = true
    }
  }, [kind, query, cwd, extra])

  return {
    items,
    active: Math.min(active, Math.max(items.length - 1, 0)),
    setActive,
    open: Boolean(id && items.length > 0 && dismissed !== id),
    dismiss: () => setDismissed(id)
  }
}

function SuggestionList({
  items,
  active,
  onPick,
  onHover
}: {
  items: Suggestion[]
  active: number
  onPick(item: Suggestion): void
  onHover(index: number): void
}) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return (
    <div
      ref={list}
      role="listbox"
      className="absolute bottom-full left-0 right-0 z-40 mb-2 max-h-[280px] overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-pop"
    >
      {items.map((item, i) => (
        <div
          key={item.key}
          role="option"
          aria-selected={i === active}
          // 用 mousedown 并阻止默认行为，点选时输入框不失去焦点
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(item)
          }}
          onMouseMove={() => i !== active && onHover(i)}
          className={`flex items-baseline gap-2 rounded-lg px-2.5 py-1.5 ${i === active ? 'bg-active' : ''}`}
        >
          <span className="shrink-0 font-mono text-[12.5px]">{item.label}</span>
          {item.hint && <span className="shrink-0 font-mono text-[12px] text-fg3">{item.hint}</span>}
          {item.detail && <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg3">{item.detail}</span>}
        </div>
      ))}
    </div>
  )
}

function Chip({ icon, children, onClick, title }: { icon: ReactNode; children: ReactNode; onClick(): void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-7 max-w-[220px] items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-fg2 hover:bg-hover hover:text-fg"
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{children}</span>
      <ChevronDown size={12} className="shrink-0 opacity-60" />
    </button>
  )
}

type Placement = 'top' | 'bottom'

export function ProjectChip({ placement = 'bottom' }: { placement?: Placement }) {
  const { projects, selectedProjectId, home, demo, setDraft, pickProject } = useDesk()
  const current = projects.find((p) => p.id === selectedProjectId)
  return (
    <Menu
      placement={placement}
      width={300}
      defaultOpen={demo?.openMenu === 'project-picker'}
      trigger={({ toggle }) => (
        <Chip icon={<Folder size={13} />} onClick={toggle} title={current?.path}>
          {current?.name ?? '选择项目'}
        </Chip>
      )}
      items={[
        ...projects.map((p) => ({
          key: p.id,
          label: p.name,
          description: shortenPath(p.path, home),
          icon: <Folder size={14} />,
          checked: p.id === selectedProjectId,
          onSelect: () => setDraft({ projectId: p.id })
        })),
        {
          key: 'add',
          label: '添加项目…',
          icon: <FolderPlus size={14} />,
          separatorBefore: projects.length > 0,
          onSelect: () => void pickProject()
        }
      ]}
    />
  )
}

export function ModelChip({ value, onChange, placement = 'bottom' }: { value: string | null; onChange(v: string | null): void; placement?: Placement }) {
  const { meta, metaError, demo } = useDesk()
  const models = meta?.models ?? []
  const current = models.find((m) => m.value === value)
  const label = current?.label ?? value ?? (metaError ? '模型' : '加载中…')
  return (
    <Menu
      placement={placement}
      width={220}
      defaultOpen={demo?.openMenu === 'model'}
      trigger={({ toggle }) => (
        <Chip icon={<Box size={13} />} onClick={toggle} title={metaError ? `无法读取模型列表：${metaError}` : '模型'}>
          {label}
        </Chip>
      )}
      items={models.map((m) => ({
        key: m.value,
        label: m.label,
        checked: m.value === value,
        onSelect: () => onChange(m.value)
      }))}
    />
  )
}

export function EffortChip({
  model,
  value,
  onChange,
  placement = 'bottom'
}: {
  model: string | null
  value: EffortLevel | null
  onChange(v: EffortLevel | null): void
  placement?: Placement
}) {
  const { meta, demo } = useDesk()
  const info = meta?.models.find((m) => m.value === model)
  // 模型列表还没加载好或模型不支持调节时不显示
  if (!info || info.efforts.length === 0) return null
  const levels = EFFORT_LEVELS.filter((l) => info.efforts.includes(l.value))
  const current = levels.find((l) => l.value === value)
  return (
    <Menu
      placement={placement}
      width={260}
      defaultOpen={demo?.openMenu === 'effort'}
      trigger={({ toggle }) => (
        <Chip icon={<Brain size={13} />} onClick={toggle} title="思考程度">
          {`思考：${current?.label ?? value ?? '未设置'}`}
        </Chip>
      )}
      items={levels.map((l) => ({
        key: l.value,
        label: l.label,
        description: l.description,
        checked: l.value === current?.value,
        onSelect: () => onChange(l.value)
      }))}
    />
  )
}

export function PermissionChip({ value, onChange, placement = 'bottom' }: { value: PermissionMode; onChange(v: PermissionMode): void; placement?: Placement }) {
  const { settings, demo } = useDesk()
  const modes = PERMISSION_MODES.filter((m) => m.value !== 'bypassPermissions' || settings?.allowBypass)
  const current = modes.find((m) => m.value === value) ?? modes[0]
  return (
    <Menu
      placement={placement}
      width={280}
      defaultOpen={demo?.openMenu === 'permission'}
      trigger={({ toggle }) => (
        <Chip icon={<Shield size={13} />} onClick={toggle} title="权限模式">
          {current.label}
        </Chip>
      )}
      items={modes.map((m) => ({
        key: m.value,
        label: m.label,
        description: m.description,
        danger: m.value === 'bypassPermissions',
        checked: m.value === value,
        onSelect: () => onChange(m.value)
      }))}
    />
  )
}
