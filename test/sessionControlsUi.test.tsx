// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionControlsPane } from '../src/renderer/components/right/SessionControlsPane'
import { backgroundTaskView } from '../src/main/backgroundTasks'
afterEach(cleanup)
const task = { task_id: 'w1', task_type: 'local_workflow', description: '检查平均值', status: 'running', workflow_progress: [
  { type: 'workflow_agent', agentId: 'a1', label: '空输入', state: 'done', promptPreview: 'private prompt' },
  { type: 'workflow_agent', agentId: 'a2', label: '数值验证', state: 'start', startedAt: 1 }
] }
it('shows both agent states, targets stop correctly and renders readable results', async () => {
  let current = structuredClone(task)
  const control = vi.fn(async (_id, _cwd, operation, id) => {
    if (operation === 'tasks') return [backgroundTaskView(current)]
    if (operation === 'stopTask') { expect(id).toBe('w1'); current.status = 'stopped'; current.workflow_progress[1].state = 'stopped'; return }
    if (operation === 'taskOutput') return { output: JSON.stringify({ agentCount: 2, result: ['empty review\nfix A', 'numeric review\nfix B'], workflowProgress: task.workflow_progress }) }
  })
  window.desk = { chat: { control } } as unknown as Window['desk']
  render(<SessionControlsPane sessionId="s" cwd="/project" active initialTab="tasks" />)
  const list = await screen.findByRole('list', { name: '子代理进度' })
  expect(within(list).getByText('空输入')).toBeTruthy()
  expect(within(list).getByText('运行中')).toBeTruthy()
  expect(within(list).getByText('已完成')).toBeTruthy()
  expect(backgroundTaskView({ ...task, status: 'stopped' }).agents[1].state).toBe('stopped')
  expect(JSON.stringify(backgroundTaskView(task))).not.toContain('private prompt')
  fireEvent.click(screen.getByRole('button', { name: '停止此任务' }))
  await screen.findByText('工作流 · 已停止')
  expect(screen.queryByRole('button', { name: '停止此任务' })).toBeNull()
  expect(control).toHaveBeenCalledWith('s', '/project', 'stopTask', 'w1')
  fireEvent.click(screen.getByRole('button', { name: '查看输出' }))
  const output = await screen.findByText(/empty review/)
  expect(output.textContent).toContain('空输入\nempty review\nfix A')
  expect(output.textContent).toContain('数值验证\nnumeric review\nfix B')
})
it('does not show a late output from the previous conversation', async () => {
  let finish!: (value: { output: string }) => void
  const control = vi.fn(async (_id, _cwd, operation) => operation === 'tasks' ? [backgroundTaskView(task)] : new Promise(resolve => { finish = resolve }))
  window.desk = { chat: { control } } as unknown as Window['desk']
  const view = render(<SessionControlsPane sessionId="old" cwd="/project" active initialTab="tasks" />)
  fireEvent.click(await screen.findByRole('button', { name: '查看输出' }))
  view.rerender(<SessionControlsPane sessionId="new" cwd="/project" active initialTab="tasks" />)
  await act(async () => finish({ output: 'stale secret result' }))
  expect(screen.queryByText('stale secret result')).toBeNull()
})
