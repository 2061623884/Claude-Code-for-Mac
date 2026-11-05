// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { notifyIfAway } from '../src/renderer/notify'
import { useDesk } from '../src/renderer/store'
import type { ChatEvent } from '../src/shared/chat'
const previous = useDesk.getState().settings
const result = { kind: 'result' } as ChatEvent
const approval = { kind: 'approval', request: { toolName: 'Read' } } as ChatEvent
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); useDesk.setState({ settings: previous }) })
it('honors completion and approval separately, preserving quiet foreground behavior', () => {
  const notice = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('desk', { app: { notify: notice } })
  const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  useDesk.setState({ settings: { theme: 'system', defaultModel: 'sonnet', defaultEffort: 'low', defaultPermissionMode: 'default', allowBypass: false, claudePath: null, notifyCompletion: false, notifyApproval: true, notificationSound: false } })
  notifyIfAway('s', result)
  expect(notice).not.toHaveBeenCalled()
  notifyIfAway('s', approval)
  expect(notice).toHaveBeenCalledOnce()
  expect(notice.mock.calls[0]).toEqual([expect.any(String), '', true, 's'])
  focus.mockReturnValue(true)
  notifyIfAway('s', approval)
  expect(notice).toHaveBeenCalledOnce()
})
it('notifies completion while the window is focused', () => {
  const notice = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('desk', { app: { notify: notice } })
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  useDesk.setState({ settings: { ...previous!, notifyCompletion: true } })
  notifyIfAway('s', result)
  expect(notice).toHaveBeenCalledOnce()
})
it('shows delivery failures in the app instead of only logging to the console', async () => {
  const notice = vi.fn().mockRejectedValue(new Error('permission denied'))
  vi.stubGlobal('desk', { app: { notify: notice } })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useDesk.setState({ settings: { ...previous!, notifyCompletion: true }, actionError: null })
  notifyIfAway('s', result)
  await vi.waitFor(() => expect(useDesk.getState().actionError).toContain('系统通知发送失败：permission denied'))
  useDesk.setState({ actionError: null })
})
it('uses the conversation title and the completed turn preview as native notification content', async () => {
  const notice = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('desk', { app: { notify: notice } })
  const savedSessions = useDesk.getState().sessions
  useDesk.setState({ settings: { ...previous!, notifyCompletion: true }, sessions: { p: [{ id: 's', title: '设置页改造', cwd: '/project', lastModified: 0, archived: false }] } as typeof savedSessions })
  notifyIfAway('s', { kind: 'result', error: null, durationMs: 1, replyPreview: '**已完成**语言下拉框，支持[简体中文](https://example.com)。' })
  expect(notice).toHaveBeenCalledWith('设置页改造', '已完成语言下拉框，支持简体中文。', false, 's')
  useDesk.setState({ sessions: savedSessions })
})
it('uses an explicit fallback for empty output and reports errors instead of a success preview', () => {
  const notice = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('desk', { app: { notify: notice } })
  useDesk.setState({ settings: { ...previous!, notifyCompletion: true } })
  notifyIfAway('missing', { kind: 'result', error: null, durationMs: 1, replyPreview: '' })
  expect(notice).toHaveBeenLastCalledWith('任务已完成', '任务已完成，点击查看回复。', false, 'missing')
  notifyIfAway('missing', { kind: 'result', error: '连接失败', durationMs: 1, replyPreview: '旧回复' })
  expect(notice).toHaveBeenLastCalledWith('Claude 运行出错', '连接失败', false, 'missing')
})
