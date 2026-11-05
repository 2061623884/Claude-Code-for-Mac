// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { useDesk } from '../src/renderer/store'
import { useChat } from '../src/renderer/chatStore'
import { draftSessionOptions } from '../src/renderer/sessionOptions'
import type { Settings } from '../src/shared/types'

const settings: Settings = { theme: 'system', defaultModel: 'opus', defaultEffort: 'medium', defaultPermissionMode: 'default', allowBypass: false, claudePath: null }
beforeEach(() => {
  useDesk.setState({ settings, draftOverrides: {}, selectedProjectId: 'p', projects: [{ id: 'p', path: '/tmp', name: 'p', addedAt: 0, collapsed: false }], sessions: {}, view: { kind: 'new' } })
  useChat.setState({ chats: {} })
  window.desk = {
    settings: { set: vi.fn(async (patch: Partial<Settings>) => ({ ...useDesk.getState().settings!, ...patch })) },
    chat: { start: vi.fn().mockResolvedValue('created') }
  } as unknown as Window['desk']
})

it('uses updated defaults immediately for a draft with no explicit overrides', async () => {
  await useDesk.getState().updateSettings({ defaultModel: 'sonnet', defaultEffort: 'high', defaultPermissionMode: 'plan' })
  await useChat.getState().start('task')
  expect(window.desk.chat.start).toHaveBeenCalledWith('/tmp', 'task', { model: 'sonnet', effort: 'high', mode: 'plan' })
})

it('preserves explicit choices, including null and a value equal to the old default, across settings navigation', async () => {
  useDesk.getState().setDraft({ model: 'opus', effort: null })
  useDesk.getState().setView({ kind: 'settings' })
  await useDesk.getState().updateSettings({ defaultModel: 'sonnet', defaultEffort: 'high', defaultPermissionMode: 'plan' })
  useDesk.getState().setView({ kind: 'new' })
  useDesk.getState().setDraft({ projectId: 'p', model: undefined })
  await useChat.getState().start('task')
  expect(window.desk.chat.start).toHaveBeenCalledWith('/tmp', 'task', { model: 'opus', effort: null, mode: 'plan' })
})

it('clears prior overrides when explicitly creating a new chat and keeps existing sessions unchanged', async () => {
  const existing = { model: 'opus', effort: 'medium' as const, mode: 'default' as const }
  useChat.setState({ chats: { old: { projectId: 'p', options: existing, loaded: true, state: 'idle', messages: [], approvals: [], error: null } } })
  useDesk.getState().setDraft({ model: null, effort: 'low', mode: 'acceptEdits' })
  await useDesk.getState().updateSettings({ defaultModel: 'sonnet', defaultEffort: 'high', defaultPermissionMode: 'plan' })
  useDesk.getState().newChat()
  await useChat.getState().start('new task')
  expect(window.desk.chat.start).toHaveBeenCalledWith('/tmp', 'new task', { model: 'sonnet', effort: 'high', mode: 'plan' })
  expect(useChat.getState().chats.old.options).toEqual(existing)
})

it('does not adopt defaults when saving settings fails', async () => {
  vi.mocked(window.desk.settings.set).mockRejectedValue(new Error('disk full'))
  await expect(useDesk.getState().updateSettings({ defaultModel: 'sonnet' })).rejects.toThrow('disk full')
  await useChat.getState().start('task')
  expect(window.desk.chat.start).toHaveBeenCalledWith('/tmp', 'task', { model: 'opus', effort: 'medium', mode: 'default' })
})

it('keeps explicit overrides after a failed start so retry uses the same choices', async () => {
  useDesk.getState().setDraft({ model: null, mode: 'plan' })
  vi.mocked(window.desk.chat.start).mockRejectedValueOnce(new Error('start failed'))
  await expect(useChat.getState().start('task')).rejects.toThrow('start failed')
  expect(draftSessionOptions(useDesk.getState())).toEqual({ model: null, effort: 'medium', mode: 'plan' })
  await useChat.getState().start('retry')
  expect(window.desk.chat.start).toHaveBeenLastCalledWith('/tmp', 'retry', { model: null, effort: 'medium', mode: 'plan' })
})

it('drops a stale bypass draft after the permission option is disabled', async () => {
  useDesk.setState({ settings: { ...settings, allowBypass: true }, draftOverrides: { mode: 'bypassPermissions' } })
  await useDesk.getState().updateSettings({ allowBypass: false })
  await useChat.getState().start('task')
  expect(window.desk.chat.start).toHaveBeenCalledWith('/tmp', 'task', expect.objectContaining({ mode: 'default' }))
})
