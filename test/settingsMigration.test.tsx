// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SettingsPage } from '../src/renderer/components/settings/SettingsPage'
import { ClaudeConfigSettings } from '../src/renderer/components/settings/ClaudeConfigSettings'
import { McpSettings } from '../src/renderer/components/settings/McpSettings'
import { useDesk } from '../src/renderer/store'
import { openAppPanel } from '../src/renderer/panelStore'
import type { ClaudeConfigSnapshot } from '../src/shared/claudeConfig'
const config = 'Usage: /config key=value\n  autoCompact=true|false\n  language=<value>\n  futureOption=one|two\n  switchModelsOnFlag=Switch automatically|Ask each time'
let values: Record<string, string>
function snapshot(): ClaudeConfigSnapshot { return { cliVersion: '2.1.301', items: [
  { key: 'autoCompact', values: ['true', 'false'], value: values.autoCompact, source: 'saved' },
  { key: 'language', values: [], value: values.language, source: 'saved' },
  { key: 'futureOption', values: ['one', 'two'], value: 'one', source: 'saved' },
  { key: 'switchModelsOnFlag', values: ['Switch automatically', 'Ask each time'], value: 'Ask each time', source: 'saved' }
] } }
beforeEach(() => {
  useDesk.setState({ home: '/home', view: { kind: 'session', sessionId: 's', projectId: 'p' }, projects: [{ id: 'p', name: 'Project', path: '/project', addedAt: 0, collapsed: false }], selectedProjectId: 'p', settings: { theme: 'light', defaultModel: 'sonnet', defaultEffort: 'low', defaultPermissionMode: 'default', claudePath: null, allowBypass: false } })
  values = { autoCompact: 'true', language: 'English' }
  window.desk = { meta: { configSnapshot: vi.fn().mockImplementation(async () => snapshot()), config: vi.fn(async (_path, value) => { if (value) { const index = value.indexOf('='); values[value.slice(0, index)] = value.slice(index + 1) }; return value ? 'Saved' : config }) }, chat: { mcp: vi.fn().mockResolvedValue([{ name: 'files', status: 'connected', tools: 7, scope: 'project' }]) } } as unknown as Window['desk']
})
afterEach(cleanup)
it('hides editable stale values during refresh and ignores superseded reads', async () => {
  const view = render(<ClaudeConfigSettings cwd="/project" />)
  await screen.findByRole('switch', { name: '自动压缩对话' })
  let finishOld!: (value: ReturnType<typeof snapshot>) => void
  vi.mocked(window.desk.meta.configSnapshot).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
  fireEvent.click(screen.getByLabelText('刷新 Claude Code 设置'))
  expect(screen.queryByRole('switch')).toBeNull()
  values.language = 'New project'
  view.rerender(<ClaudeConfigSettings cwd="/other" />)
  await waitFor(() => expect((screen.getByLabelText('回复语言') as HTMLInputElement).value).toBe('New project'))
  values.language = 'Stale project'
  await act(async () => finishOld(snapshot()))
  expect((screen.getByLabelText('回复语言') as HTMLInputElement).value).toBe('New project')
})
it('does not project a previous project save into a new project or retain its save lock', async () => {
  let finishWrite!: (value: string) => void
  vi.mocked(window.desk.meta.config).mockImplementationOnce(() => new Promise(resolve => { finishWrite = resolve }))
  const view = render(<ClaudeConfigSettings cwd="/project" />)
  fireEvent.click(await screen.findByRole('switch', { name: '自动压缩对话' }))
  view.rerender(<ClaudeConfigSettings cwd="/other" />)
  await waitFor(() => expect((screen.getByRole('switch', { name: '自动压缩对话' }) as HTMLButtonElement).disabled).toBe(false))
  const reads = vi.mocked(window.desk.meta.configSnapshot).mock.calls.length
  await act(async () => finishWrite('Saved'))
  expect(window.desk.meta.configSnapshot).toHaveBeenCalledTimes(reads)
  expect(screen.queryByText('已保存')).toBeNull()
  fireEvent.click(screen.getByRole('switch', { name: '自动压缩对话' }))
  await screen.findByText('已保存')
  expect(window.desk.meta.config).toHaveBeenLastCalledWith('/other', 'autoCompact=false')
})
it('marks the saved field unknown when the confirming read fails and allows retry', async () => {
  render(<ClaudeConfigSettings cwd="/project" />)
  const toggle = await screen.findByRole('switch', { name: '自动压缩对话' })
  vi.mocked(window.desk.meta.configSnapshot).mockRejectedValueOnce(new Error('read failed'))
  fireEvent.click(toggle)
  await screen.findByText('已保存，但重新读取失败：read failed')
  expect((screen.getByLabelText('自动压缩对话') as HTMLSelectElement).value).toBe('')
  fireEvent.click(screen.getByLabelText('刷新 Claude Code 设置'))
  expect((await screen.findByRole('switch', { name: '自动压缩对话' })).getAttribute('aria-checked')).toBe('false')
})
it('routes config and MCP to settings, preserving the originating session and project', async () => {
  expect(openAppPanel('config', '')).toBe(true)
  expect(useDesk.getState().view).toMatchObject({ kind: 'settings', tab: 'claude', sessionId: 's', projectId: 'p' })
  render(<SettingsPage />)
  fireEvent.click(screen.getByRole('button', { name: '上下文' }))
  await screen.findByLabelText('自动压缩对话')
  fireEvent.click(screen.getByRole('button', { name: '连接与 MCP' }))
  await screen.findByText('files')
  expect(window.desk.chat.mcp).toHaveBeenCalledWith('s', '/project')
  fireEvent.change(screen.getByLabelText('项目'), { target: { value: '' } })
  await waitFor(() => expect(window.desk.chat.mcp).toHaveBeenCalledWith(null, '/home'))
})
it('renders every returned option, searches labels and saves enumerated and free values', async () => {
  render(<ClaudeConfigSettings cwd="/project" />)
  await screen.findByLabelText('futureOption')
  expect(screen.getAllByRole('combobox')).toHaveLength(2)
  expect(screen.getByRole('switch', { name: '自动压缩对话' }).getAttribute('aria-checked')).toBe('true')
  expect((screen.getByLabelText('回复语言') as HTMLInputElement).value).toBe('English')
  fireEvent.click(screen.getByRole('switch', { name: '自动压缩对话' }))
  await screen.findByText('已保存')
  expect(screen.getByRole('switch', { name: '自动压缩对话' }).getAttribute('aria-checked')).toBe('false')
  expect(window.desk.meta.config).toHaveBeenCalledWith('/project', 'autoCompact=false')
  fireEvent.change(screen.getByLabelText('回复语言'), { target: { value: '简体中文' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect((screen.getByLabelText('回复语言') as HTMLInputElement).value).toBe('简体中文'))
  expect(window.desk.meta.config).toHaveBeenCalledWith('/project', 'language=简体中文')
  fireEvent.change(screen.getByLabelText('搜索 Claude Code 设置'), { target: { value: '语言' } })
  expect(screen.queryByLabelText('futureOption')).toBeNull()
})
it('does not claim success or permit conflicting edits while a write is pending', async () => {
  let reject!: (error: Error) => void
  window.desk.meta.config = vi.fn((_path, value) => value ? new Promise<string>((_resolve, fail) => { reject = fail }) : Promise.resolve(config))
  render(<ClaudeConfigSettings cwd="/project" />)
  fireEvent.click(await screen.findByRole('switch', { name: '自动压缩对话' }))
  expect((screen.getByLabelText('futureOption') as HTMLSelectElement).disabled).toBe(true)
  await act(async () => reject(new Error('managed policy')))
  expect(screen.getByRole('alert').textContent).toContain('managed policy')
  expect(screen.queryByText('已保存')).toBeNull()
  expect(screen.getByRole('switch', { name: '自动压缩对话' }).getAttribute('aria-checked')).toBe('true')
})
it('MCP empty and failure states both allow retry', async () => {
  window.desk.chat.mcp = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([{ name: 'recovered', status: 'pending', tools: 0 }])
  render(<McpSettings cwd="/project" sessionId={null} />)
  await screen.findByText('没有配置 MCP 服务器。')
  fireEvent.click(screen.getByLabelText('刷新 MCP'))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByLabelText('刷新 MCP'))
  await screen.findByText('recovered')
})
it('leaves argument commands on their existing route and does not intercept btw', () => {
  expect(openAppPanel('config', 'language=Chinese')).toBe(false)
  expect(openAppPanel('btw', 'question')).toBe(false)
})

it('reads persisted values when reopening and surfaces read errors instead of invented defaults', async () => {
  const view = render(<ClaudeConfigSettings cwd="/project" />)
  fireEvent.click(await screen.findByRole('switch', { name: '自动压缩对话' }))
  await screen.findByText('已保存')
  view.unmount()
  render(<ClaudeConfigSettings cwd="/project" />)
  expect((await screen.findByRole('switch', { name: '自动压缩对话' })).getAttribute('aria-checked')).toBe('false')
  window.desk.meta.configSnapshot = vi.fn().mockRejectedValue(new Error('Cannot read preferences'))
  fireEvent.click(screen.getByLabelText('刷新 Claude Code 设置'))
  await screen.findByRole('alert')
  expect(screen.queryByRole('switch')).toBeNull()
})

it('keeps desktop defaults separate from native defaults and does not repeat the catalog', async () => {
  useDesk.setState({ view: { kind: 'settings', tab: 'models' } })
  render(<SettingsPage />)
  expect(screen.getByText('新对话默认值')).toBeTruthy()
  expect(window.desk.meta.configSnapshot).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '终端默认值' }))
  await screen.findByLabelText('安全检查标记消息时切换模型')
  expect(screen.queryByLabelText('自动压缩对话')).toBeNull()
  expect(screen.queryByText('新对话默认值')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '上下文' }))
  await screen.findByLabelText('自动压缩对话')
  expect(screen.queryByLabelText('安全检查标记消息时切换模型')).toBeNull()
})
it('updates desktop interaction preferences without writing terminal config', async () => {
  const updateSettings = vi.fn().mockResolvedValue(undefined)
  useDesk.setState({ view: { kind: 'settings' }, updateSettings })
  render(<SettingsPage />)
  fireEvent.click(screen.getByRole('switch', { name: '自动跟随最新回复' }))
  expect(updateSettings).toHaveBeenCalledWith({ autoScroll: false })
  fireEvent.click(screen.getByRole('switch', { name: '减少动效' }))
  expect(updateSettings).toHaveBeenCalledWith({ reduceMotion: true })
  expect(window.desk.meta.config).not.toHaveBeenCalled()
})
it('surfaces failed desktop preference writes and keeps the last confirmed value', async () => {
  useDesk.setState({ view: { kind: 'settings' }, updateSettings: vi.fn().mockRejectedValue(new Error('disk full')) })
  render(<SettingsPage />)
  fireEvent.click(screen.getByRole('switch', { name: '减少动效' }))
  expect((await screen.findByRole('alert')).textContent).toBe('设置保存失败：disk full')
  expect(screen.getByRole('switch', { name: '减少动效' }).getAttribute('aria-checked')).toBe('false')
})
