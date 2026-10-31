// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { $getRoot, $createParagraphNode, $createTextNode, type LexicalEditor } from 'lexical'
import { Composer } from '../src/renderer/components/newSession/Composer'
afterEach(cleanup)
function HistoryComposer({ initial = '' }: { initial?: string }) {
  const [text, setText] = useState(initial)
  return <Composer history={[{ id: '1', text: '较早输入' }, { id: '2', text: '最新输入' }]} value={text} onChange={setText} attachments={[]} onAttachmentsChange={() => {}} onSubmit={async () => {}} canSubmit submitHint="发送" chips={null} />
}
it('recalls only into an empty composer, browses both directions and never submits', async () => {
  render(<HistoryComposer />)
  const box = screen.getByRole('textbox')
  fireEvent.focus(box)
  fireEvent.keyDown(box, { key: 'ArrowUp' })
  await waitFor(() => expect(box.textContent).toBe('最新输入'))
  fireEvent.keyDown(box, { key: 'ArrowUp' })
  await waitFor(() => expect(box.textContent).toBe('较早输入'))
  fireEvent.keyDown(box, { key: 'ArrowDown' })
  await waitFor(() => expect(box.textContent).toBe('最新输入'))
  fireEvent.keyDown(box, { key: 'ArrowDown' })
  await waitFor(() => expect(box.textContent).toBe(''))
  fireEvent.keyDown(box, { key: 'ArrowUp', isComposing: true })
  expect(box.textContent).toBe('')
})
it('does not replace a draft and exits history navigation after editing', async () => {
  render(<HistoryComposer />)
  const box = screen.getByRole('textbox')
  fireEvent.focus(box); fireEvent.keyDown(box, { key: 'ArrowUp' })
  await waitFor(() => expect(box.textContent).toBe('最新输入'))
  const editor = (box as unknown as { __lexicalEditor: LexicalEditor }).__lexicalEditor
  await act(async () => { editor.update(() => { $getRoot().clear().append($createParagraphNode().append($createTextNode('我修改的草稿'))) }) })
  fireEvent.keyDown(box, { key: 'ArrowUp' })
  expect(box.textContent).toBe('我修改的草稿')
})
