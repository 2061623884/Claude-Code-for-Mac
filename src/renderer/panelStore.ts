// 输入框上方的命令浮层（/usage、/model、/config…）：同一时间只开一个，看完关掉，不写入对话
import { create } from 'zustand'
import { APP_COMMANDS, type AppPanelName } from '@shared/commandCatalog'
import type { CommandBlock } from '@shared/chat'

/** 应用自己实现的命令面板 */
export type AppPanel = AppPanelName

export type Panel = { kind: 'app'; name: AppPanel } | { kind: 'output'; block: CommandBlock }

const PANEL_BY_COMMAND = Object.fromEntries(APP_COMMANDS.map((command) => [command.name, command.panel]))

/** 不带参数的 /usage、/model… 由应用自己弹出面板；带参数（如 /model sonnet）的仍交给 Claude Code 执行 */
export function appPanelFor(name: string, args: string): AppPanel | null {
  return args ? null : (PANEL_BY_COMMAND[name] ?? null)
}

interface PanelStore {
  panel: Panel | null
  open(panel: Panel): void
  close(): void
}

export const usePanel = create<PanelStore>((set) => ({
  panel: null,
  open: (panel) => set({ panel }),
  close: () => set({ panel: null })
}))

/** 输入框的命令拦截：应用自己的面板命令就打开浮层并返回 true，否则返回 false（交给 Claude Code） */
export function openAppPanel(name: string, args: string): boolean {
  const panel = appPanelFor(name, args)
  if (panel) usePanel.getState().open({ kind: 'app', name: panel })
  return panel !== null
}
