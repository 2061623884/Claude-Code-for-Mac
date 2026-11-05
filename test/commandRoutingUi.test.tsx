// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Composer } from '../src/renderer/components/newSession/Composer'

vi.mock('../src/renderer/components/newSession/ComposerEditor', () => ({ ComposerEditor: ({ value }: { value: string }) => <textarea aria-label="输入" readOnly value={value} /> }))
vi.mock('../src/renderer/components/newSession/ComposerCrab', () => ({ ComposerCrab: () => null }))
vi.mock('../src/renderer/components/newSession/useSuggestions', () => ({ useSuggestions: () => ({ open: false, items: [], active: -1, setActive: vi.fn(), dismiss: vi.fn(), retry: vi.fn() }) }))
vi.mock('../src/renderer/components/files/AttachmentCard', () => ({ AttachmentCard: () => <span>附件</span> }))
afterEach(cleanup)
const file = { path: '/tmp/example.txt', name: 'example.txt', extension: 'txt', bytes: 1 }
function setup(value: string, attachments = [] as typeof file[], onCommand?: (name: string, args: string) => boolean) {
  const onSubmit = vi.fn().mockResolvedValue(undefined), onChange = vi.fn()
  render(<Composer value={value} onChange={onChange} attachments={attachments} onAttachmentsChange={vi.fn()} onSubmit={onSubmit} canSubmit submitHint="发送" chips={null} onCommand={onCommand} />)
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  return { onSubmit, onChange }
}
it('rejects a control with attachments without losing the draft', () => {
  const command = vi.fn().mockReturnValue(true)
  const { onSubmit, onChange } = setup('/fast', [file], command)
  expect(screen.getByRole('alert').textContent).toContain('不能附带文件')
  expect(onSubmit).not.toHaveBeenCalled(); expect(onChange).not.toHaveBeenCalled(); expect(command).not.toHaveBeenCalled()
})
it('opens bare fast locally without sending a message', () => {
  const command = vi.fn().mockReturnValue(true)
  const { onSubmit, onChange } = setup('/fast', [], command)
  expect(command).toHaveBeenCalledWith('fast', '')
  expect(onSubmit).not.toHaveBeenCalled(); expect(onChange).toHaveBeenCalledWith('')
})
it('keeps invalid control arguments in the editor', () => {
  const { onSubmit, onChange } = setup('/fast invalid', [], vi.fn())
  expect(screen.getByRole('alert').textContent).toContain('/fast')
  expect(onSubmit).not.toHaveBeenCalled(); expect(onChange).not.toHaveBeenCalled()
})
it('does not save a control command as an edited queue message', () => {
  const { onSubmit, onChange } = setup('/fast on')
  expect(screen.getByRole('alert').textContent).toContain('消息队列')
  expect(onSubmit).not.toHaveBeenCalled(); expect(onChange).not.toHaveBeenCalled()
})
it('continues to send skill commands as prompts', async () => {
  const { onSubmit } = setup('/code-review src', [], vi.fn().mockReturnValue(false))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ prompt: '/code-review src' })))
})
