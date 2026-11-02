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
  const notice = vi.fn(function () {})
  vi.stubGlobal('Notification', notice)
  const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  useDesk.setState({ settings: { theme: 'system', defaultModel: 'sonnet', defaultEffort: 'low', defaultPermissionMode: 'default', allowBypass: false, claudePath: null, notifyCompletion: false, notifyApproval: true, notificationSound: false } })
  notifyIfAway('s', result)
  expect(notice).not.toHaveBeenCalled()
  notifyIfAway('s', approval)
  expect(notice).toHaveBeenCalledOnce()
  expect(notice.mock.calls[0]).toEqual([expect.any(String), { body: '', silent: true }])
  focus.mockReturnValue(true)
  notifyIfAway('s', approval)
  expect(notice).toHaveBeenCalledOnce()
})
