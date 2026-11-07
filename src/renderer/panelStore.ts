// 输入框上方的命令浮层（/usage、/model、/config…）：同一时间只开一个，看完关掉，不写入对话
import { useDesk } from './store'
import { create } from 'zustand'
import { parseDesktopCommand } from '@shared/sessionCommand'
import { type AppPanelName } from '@shared/commandCatalog'
import type { CommandBlock } from '@shared/chat'

/** 应用自己实现的命令面板 */
export type AppPanel = AppPanelName

export type Panel = { kind: 'app'; name: AppPanel } | { kind: 'output'; block: CommandBlock }


/** 不带参数的 /usage、/model… 由应用自己弹出面板；带参数的命令由会话发送入口处理 */
export function appPanelFor(name: string, args: string): AppPanel | null {
  const command = parseDesktopCommand(`/${name}${args ? ' ' + args : ''}`)
  return command?.kind === 'panel' ? command.panel : null
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
  if (!args && ['config', 'settings', 'output-style', 'mcp'].includes(name)) {
    usePanel.getState().close()
    const { view, selectedProjectId } = useDesk.getState()
    // MCP 统一在「技能与插件」页管理，带上当前项目
    if (name === 'mcp') {
      useDesk.getState().setView({ kind: 'skills', tab: 'mcp', projectId: view.kind === 'session' ? view.projectId : view.kind === 'new' ? selectedProjectId : null })
      return true
    }
    useDesk.getState().setView({ kind: 'settings', tab: name === 'output-style' ? 'context' : 'claude', ...(view.kind === 'session' ? { sessionId: view.sessionId, projectId: view.projectId } : view.kind === 'new' ? { projectId: selectedProjectId, sessionId: null } : {}) })
    return true
  }
  const panel = appPanelFor(name, args)
  if (panel) usePanel.getState().open({ kind: 'app', name: panel })
  return panel !== null
}
