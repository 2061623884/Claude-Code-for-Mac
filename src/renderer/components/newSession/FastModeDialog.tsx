import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button, Dialog } from '../ui/Dialog'

export function FastModeDialog({ needsCredits, busy, onClose, onConfirm }: {
  needsCredits: boolean
  busy?: boolean
  onClose(): void
  onConfirm(): void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => previous?.focus()
  }, [])
  return createPortal(<div ref={ref} onMouseDown={event => event.stopPropagation()} onKeyDown={event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    if (event.key === 'Tab') {
      const elements = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')
      if (!elements?.length) return
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }}>
    <Dialog title="开启 Fast 模式？" onClose={onClose} width={420} footer={<>
      <Button onClick={onClose}>取消</Button>
      <Button variant="primary" disabled={busy} onClick={onConfirm}>{needsCredits ? '已完成设置，开启 Fast' : '确认开启'}</Button>
    </>}>
      <div className="space-y-3 text-[13px] leading-6">
        <p>Fast 响应更快，但始终按额外用量计费，即使订阅额度还有剩余。</p>
        <div className="rounded-lg border border-line bg-chip px-3 py-2">
          <p>{needsCredits ? '请先在 Claude 用量设置中启用 Usage credits，再返回这里确认开启。' : '请确认账号已启用 Usage credits。使用 API 登录时，费用计入 API 账单。'}</p>
          <a className="text-fg underline underline-offset-4 hover:text-fg2" href="https://claude.ai/settings/usage" target="_blank" rel="noreferrer">打开 Claude 用量设置</a>
        </div>
      </div>
    </Dialog>
  </div>, document.body)
}
