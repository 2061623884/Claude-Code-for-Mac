// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { backgroundTaskList, backgroundTaskView, plainTerminalText } from '../src/main/backgroundTasks'
import { BackgroundTasksPane } from '../src/renderer/components/right/BackgroundTasksPane'
import { SessionSummary } from '../src/renderer/components/summary/SessionSummary'
import { useChat } from '../src/renderer/chatStore'
import { useDesk } from '../src/renderer/store'
import { useLayout } from '../src/renderer/layoutStore'
import { useSummaryUi } from '../src/renderer/summaryUiStore'
import { emptySessionSummary } from '../src/shared/sessionSummary'
import type { BackgroundTask } from '../src/shared/chat'

const bash: BackgroundTask = { id: 'b1', type: 'local_bash', description: 'npm run dev', status: 'running', startedAt: Date.now() - 65_000, agents: [] }
const agent: BackgroundTask = { id: 'a1', type: 'local_agent', description: '检查测试', status: 'completed', startedAt: 1, endedAt: 31_001, tokens: 12_000, agents: [] }

function setTasks(tasks: BackgroundTask[]): void {
  const base = { projectId: 'p', messages: [], state: 'idle' as const, approvals: [], loaded: true, options: { model: null, mode: 'default' as const, effort: null }, error: null, summary: emptySessionSummary() }
  useChat.setState({ chats: { s: { ...base, tasks } } })
}

beforeEach(() => {
  useDesk.setState({ view: { kind: 'session', sessionId: 's', projectId: 'p' }, projects: [{ id: 'p', path: '/project', name: 'Workspace', addedAt: 0, collapsed: false }] })
  useSummaryUi.setState({ opened: {}, expanded: {}, announced: {} })
  useLayout.setState({ activeSessionId: 's', pages: [], openFiles: [], rightTab: null, rightOpen: false })
  setTasks([])
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it('lists only background work, running first, without private fields', () => {
  const list = backgroundTaskList([
    { task_id: 'done', task_type: 'local_bash', description: 'build', status: 'completed', startedAt: 1, endedAt: 2 },
    { task_id: 'fg', task_type: 'local_agent', description: 'foreground', status: 'running', is_backgrounded: false, startedAt: 3 },
    { task_id: 'amb', task_type: 'local_monitor', description: 'watcher', status: 'running', ambient: true, startedAt: 3 },
    { task_id: 'run', task_type: 'local_bash', description: 'dev server', status: 'running', startedAt: 4, prompt: 'secret' }
  ])
  expect(list.map(t => t.id)).toEqual(['run', 'done'])
  expect(JSON.stringify(list)).not.toContain('secret')
  expect(backgroundTaskView({ task_id: 'k', status: 'killed', usage: { total_tokens: 5, tool_uses: 2 } })).toMatchObject({ status: 'stopped', tokens: 5, toolUses: 2 })
})

it('strips terminal escapes and keeps the last carriage-return frame', () => {
  expect(plainTerminalText('\x1b[32mok\x1b[0m\n10%\r50%\r100%\ndone\r\n')).toBe('ok\n100%\ndone\n')
})

it('pops the summary once per new background task and opens it in the right panel', () => {
  render(<SessionSummary sessionId="s" projectId="p" />)
  expect(screen.queryByRole('region', { name: '会话摘要' })).toBeNull()
  act(() => setTasks([bash, agent]))
  const panel = screen.getByRole('region', { name: '会话摘要' })
  expect(within(panel).getByText('npm run dev')).toBeTruthy()
  expect(within(panel).getByText('运行中 · 1 分 5 秒')).toBeTruthy()
  expect(document.querySelector('[data-task-badge]')?.textContent).toBe('1')

  // 关掉以后，同一个任务的进度更新不会再弹出
  fireEvent.click(screen.getByRole('button', { name: '切换摘要面板状态' }))
  act(() => setTasks([{ ...bash, lastTool: 'Bash' }, agent]))
  expect(screen.queryByRole('region', { name: '会话摘要' })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: '切换摘要面板状态' }))
  fireEvent.click(screen.getByRole('button', { name: /npm run dev/ }))
  const page = useLayout.getState().pages.find(p => p.kind === 'tasks')
  expect(page).toMatchObject({ taskId: 'b1', sessionId: 's' })
  expect(useLayout.getState().rightTab).toBe(page?.id)
})

it('shows live output for the selected task and stops it', async () => {
  const taskOutput = vi.fn().mockResolvedValue({ output: 'listening on 5173', truncated: true })
  const stopTask = vi.fn().mockResolvedValue(undefined)
  window.desk = { chat: { taskOutput, stopTask } } as unknown as Window['desk']
  setTasks([bash, agent])
  render(<BackgroundTasksPane sessionId="s" cwd="/project" taskId="b1" active />)
  expect((await screen.findByLabelText('任务输出')).textContent).toBe('listening on 5173')
  expect(screen.getByText('只显示最后 8 KB 输出')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '停止任务' }))
  expect(stopTask).toHaveBeenCalledWith('s', '/project', 'b1')

  // 子 Agent 没有可读的输出，不去请求
  taskOutput.mockClear()
  fireEvent.click(screen.getByRole('button', { name: /检查测试/ }))
  expect(screen.getByText('子 Agent 完成后，结果会回到对话里。')).toBeTruthy()
  expect(taskOutput).not.toHaveBeenCalled()
})

it('keeps only one active output poll and ignores late output after a conversation switch', async () => {
  vi.useFakeTimers()
  let finish!: (value: { output: string }) => void
  const taskOutput = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve }))
  window.desk = { chat: { taskOutput } } as unknown as Window['desk']
  setTasks([bash])
  useChat.setState(s => ({ chats: { ...s.chats, other: { ...s.chats.s, tasks: [bash] } } }))
  const view = render(<BackgroundTasksPane sessionId="s" cwd="/project" taskId="b1" active />)
  const old = finish
  await act(() => vi.advanceTimersByTimeAsync(6000))
  expect(taskOutput).toHaveBeenCalledTimes(1)
  view.rerender(<BackgroundTasksPane sessionId="other" cwd="/project" taskId="b1" active />)
  const current = finish
  await act(async () => { old({ output: 'stale secret' }) })
  expect(screen.queryByText('stale secret')).toBeNull()
  await act(async () => { current({ output: 'current' }) })
  expect(screen.getByLabelText('任务输出').textContent).toBe('current')
  view.unmount()
  await act(() => vi.advanceTimersByTimeAsync(6000))
  expect(taskOutput).toHaveBeenCalledTimes(2)
})

it('renders workflow results without exposing private agent prompts', async () => {
  const task: BackgroundTask = { ...bash, id: 'w', type: 'local_workflow', status: 'completed', agents: [{ id: 'a', label: '验证', state: 'completed' }] }
  setTasks([task])
  window.desk = { chat: { taskOutput: vi.fn().mockResolvedValue({ output: JSON.stringify({ agentCount: 1, result: ['verified'], workflowProgress: [{ type: 'workflow_agent', label: '验证', prompt: 'private prompt' }] }) }) } } as unknown as Window['desk']
  render(<BackgroundTasksPane sessionId="s" cwd="/project" taskId="w" active />)
  expect((await screen.findByLabelText('任务输出')).textContent).toBe('验证\nverified')
  expect(screen.queryByText('private prompt')).toBeNull()
})
