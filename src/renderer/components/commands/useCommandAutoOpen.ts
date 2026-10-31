import { useEffect, useRef } from 'react'
import type { UiMessage } from '@shared/chat'
import { usePanel } from '../../panelStore'

/** 刚执行的本地命令（/output-style…）：输出自动弹出浮层。打开会话时已有的命令不弹 */
export function useCommandAutoOpen(messages: UiMessage[] | undefined, loaded: boolean | undefined): void {
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!loaded || !messages) return
    const commands = messages.filter((m) => m.blocks[0]?.kind === 'command')
    if (!seen.current) {
      seen.current = new Set(commands.map((m) => m.id))
      return
    }
    for (const m of commands) {
      if (seen.current.has(m.id)) continue
      seen.current.add(m.id)
      const block = m.blocks[0]
      if (block?.kind === 'command') usePanel.getState().open({ kind: 'output', block })
    }
  }, [loaded, messages])
}
