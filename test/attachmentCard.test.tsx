// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AttachmentCard } from '../src/renderer/components/files/AttachmentCard'
import { FileContext, LinkifiedText } from '../src/renderer/components/files/FileLink'
import { useLayout } from '../src/renderer/layoutStore'
import { referenceFor } from '../src/shared/attachments'
import { findBarePaths } from '../src/shared/fileLinks'

afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(window, 'desk') })

it('renders a dropped image as a thumbnail and opens its preview', async () => {
  const read = vi.fn().mockResolvedValue({ kind: 'image', dataUrl: 'data:image/png;base64,YQ==' })
  Object.defineProperty(window, 'desk', { configurable: true, value: { files: { read } } })
  const open = vi.spyOn(useLayout.getState(), 'openFile')
  render(<AttachmentCard path="/work/photo.png" />)
  expect(await screen.findByRole('img', { name: 'photo.png' })).toHaveProperty('src', 'data:image/png;base64,YQ==')
  fireEvent.click(screen.getByRole('button', { name: '预览 photo.png' }))
  expect(open).toHaveBeenCalledWith('/work/photo.png', undefined)
})

it('shows presentation name and type with an independent removal action', () => {
  const remove = vi.fn()
  render(<AttachmentCard path="/work/季度汇报.pptx" onRemove={remove} />)
  expect(screen.getByText('季度汇报.pptx')).toBeTruthy()
  expect(screen.getByText('PPTX')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '移除 季度汇报.pptx' }))
  expect(remove).toHaveBeenCalledOnce()
})

it('keeps a readable card when the image is missing or cannot be previewed', async () => {
  const read = vi.fn().mockRejectedValue(new Error('missing'))
  Object.defineProperty(window, 'desk', { configurable: true, value: { files: { read } } })
  render(<AttachmentCard path="/work/missing.png" />)
  await waitFor(() => expect(read).toHaveBeenCalled())
  expect(screen.getByText('missing.png')).toBeTruthy()
  expect(screen.queryByRole('img')).toBeNull()
})

it('round trips spaced filenames and renders sent references as cards', async () => {
  const path = '/work/季度 汇报.pptx'
  const ref = referenceFor(path, '/work')
  expect(findBarePaths(`${ref}\n\n请查看`)).toEqual([{ start: 0, end: ref.length, ref: { path: '季度 汇报.pptx' } }])
  Object.defineProperty(window, 'desk', { configurable: true, value: { files: { stat: vi.fn().mockResolvedValue({ [path]: 'file' }) } } })
  render(<FileContext.Provider value={{ cwd: '/work' }}><LinkifiedText text={`${ref}\n\n请查看`} attachments /></FileContext.Provider>)
  expect(await screen.findByRole('button', { name: '预览 季度 汇报.pptx' })).toBeTruthy()
  expect(screen.getByText('PPTX')).toBeTruthy()
})
