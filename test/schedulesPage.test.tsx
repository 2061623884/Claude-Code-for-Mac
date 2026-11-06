// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { formatUntil, SchedulesPage } from '../src/renderer/components/schedules/SchedulesPage'
import { Sidebar } from '../src/renderer/components/sidebar/Sidebar'
import { useDesk } from '../src/renderer/store'
import type { ScheduledTask } from '../src/shared/schedules'

const task: ScheduledTask = {
  id: 't1', name: '每日汇总', projectPath: '/p', prompt: '总结昨天的提交', schedule: { kind: 'weekly', days: [1, 2, 3, 4, 5], time: '09:00' },
  mode: 'default', enabled: true, createdAt: 0, nextRunAt: Date.now() + 3600_000, lastRun: { at: Date.now() - 60_000, sessionId: 's1' }
}
let schedules: Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  useDesk.setState({ view: { kind: 'new' }, demo: null, settings: null, selectedProjectId: 'p', projects: [{ id: 'p', name: '原项目', path: '/p', addedAt: 0, collapsed: false }], sessions: {} })
  schedules = {
    list: vi.fn().mockResolvedValue([task]),
    create: vi.fn().mockResolvedValue([task]),
    setEnabled: vi.fn().mockResolvedValue([{ ...task, enabled: false, nextRunAt: null }]),
    onChanged: vi.fn(() => () => {})
  }
  window.desk = { schedules } as unknown as Window['desk']
})
afterEach(cleanup)

it('opens skills and schedules from the sidebar between new chat and search', () => {
  window.desk = { ...window.desk, usage: { overview: vi.fn().mockResolvedValue(null) } } as unknown as Window['desk']
  render(<Sidebar width={260} />)
  const labels = screen.getAllByRole('button').map(button => button.textContent)
  expect(labels.indexOf('技能与插件')).toBe(labels.indexOf('新对话') + 1)
  expect(labels.indexOf('定时任务')).toBe(labels.indexOf('技能与插件') + 1)
  expect(labels.indexOf('搜索⌘K')).toBe(labels.indexOf('定时任务') + 1)
  fireEvent.click(screen.getByRole('button', { name: '技能与插件' }))
  expect(useDesk.getState().view).toEqual({ kind: 'skills' })
  fireEvent.click(screen.getByRole('button', { name: '定时任务' }))
  expect(useDesk.getState().view).toEqual({ kind: 'schedules' })
})

it('lists tasks, toggles them and links to the last conversation', async () => {
  render(<SchedulesPage />)
  expect(await screen.findByText('每日汇总')).toBeTruthy()
  expect(screen.getByText('工作日 09:00')).toBeTruthy()
  expect(screen.getByText('原项目')).toBeTruthy()
  expect(screen.getByText('默认')).toBeTruthy()
  expect(screen.getByText('总结昨天的提交')).toBeTruthy()
  expect(screen.getByText(/· 60 分钟后|· 1 小时后/)).toBeTruthy()
  expect(screen.getByText('已运行')).toBeTruthy()
  fireEvent.click(screen.getByRole('switch', { name: '启用 每日汇总' }))
  expect(schedules.setEnabled).toHaveBeenCalledWith('t1', false)
  await waitFor(() => expect(screen.getAllByText('已暂停')).toHaveLength(2))
  fireEvent.click(screen.getByRole('button', { name: '查看对话' }))
  expect(useDesk.getState().view).toEqual({ kind: 'session', sessionId: 's1', projectId: 'p' })
})

it('hides a prompt identical to the name and highlights a failed last run', async () => {
  schedules.list.mockResolvedValue([{ ...task, name: '测试', prompt: '测试', lastRun: { at: Date.now() - 60_000, error: '项目目录不存在' } }])
  render(<SchedulesPage />)
  expect(await screen.findAllByText('测试')).toHaveLength(1)
  expect(screen.getByText('上次失败')).toBeTruthy()
  expect(screen.getByText('失败：项目目录不存在')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '查看对话' })).toBeNull()
})

it('formats time until the next run', () => {
  const now = new Date(2026, 10, 6, 18, 0).getTime()
  expect(formatUntil(now + 2 * 60_000, now)).toBe('2 分钟后')
  expect(formatUntil(now + 3 * 3600_000, now)).toBe('3 小时后')
  expect(formatUntil(now - 1000, now)).toBe('即将运行')
  expect(formatUntil(now + 30 * 3600_000, now)).toBeNull()
})

it('creates a task from the editor', async () => {
  schedules.list.mockResolvedValue([])
  render(<SchedulesPage />)
  await screen.findByText('还没有定时任务')
  fireEvent.click(screen.getAllByRole('button', { name: /新建任务/ })[0])
  fireEvent.change(screen.getByPlaceholderText('例如：每日提交汇总'), { target: { value: '依赖检查' } })
  fireEvent.change(screen.getByPlaceholderText('到点后发送给 Claude 的内容'), { target: { value: '检查依赖更新' } })
  fireEvent.click(screen.getByRole('button', { name: '间隔' }))
  expect(screen.getByText(/下次运行：/)).toBeTruthy()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(schedules.create).toHaveBeenCalledWith({ name: '依赖检查', projectPath: '/p', prompt: '检查依赖更新', schedule: { kind: 'interval', minutes: 60 }, mode: 'default', enabled: true })
})
