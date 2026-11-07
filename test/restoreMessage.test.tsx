// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RestoreMessage } from '../src/renderer/components/chat/RestoreMessage'
import { useChat } from '../src/renderer/chatStore'
import { useDesk } from '../src/renderer/store'
import type { UiMessage } from '../src/shared/chat'

afterEach(cleanup)

it('previews affected files and requires confirmation before restoring them', async () => {
  const message: UiMessage = { id: 'm', uuid: 'm', role: 'user', parentToolUseId: null, forkFrom: null, blocks: [{ kind: 'text', text: 'hello' }] }
  useDesk.setState({ projects: [{ id: 'p', path: '/tmp/project', name: 'p', addedAt: 0, collapsed: false }], view: { kind: 'session', sessionId: 's', projectId: 'p' } })
  useChat.setState({ chats: { s: { projectId: 'p', loaded: true, state: 'idle' } as any } })
  const rewindPreview = vi.fn().mockResolvedValue({ canRewind: true, filesChanged: ['src/file.ts'] })
  const rewindFiles = vi.fn().mockResolvedValue({ canRewind: true })
  window.desk = { chat: { rewindPreview, rewindFiles } } as unknown as Window['desk']
  render(<RestoreMessage message={message} />)
  fireEvent.click(screen.getByRole('button', { name: '更多' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '仅恢复文件' })).not.toHaveProperty('disabled', true))
  fireEvent.click(screen.getByRole('button', { name: '仅恢复文件' }))
  expect(screen.getByText('src/file.ts')).toBeTruthy()
  expect(rewindPreview).toHaveBeenCalledTimes(1)
  expect(rewindFiles).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(rewindPreview).toHaveBeenCalledTimes(1)
  expect(rewindFiles).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '仅恢复文件' }))
  fireEvent.click(screen.getByRole('button', { name: '确认恢复文件' }))
  await waitFor(() => expect(rewindFiles).toHaveBeenCalledWith('s', '/tmp/project', 'm'))
})
