// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComposerAttachment, ComposerSubmission } from '../src/shared/attachments'
import type { FileInfo } from '../src/shared/types'
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical'
import { Composer } from '../src/renderer/components/newSession/Composer'
import { FileNode } from '../src/renderer/components/newSession/ComposerEditor'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'desk')
})

const attachment: ComposerAttachment = {
  path: '/work/project/src/a.ts',
  name: 'a.ts',
  extension: 'ts',
  bytes: 10
}

function Harness({
  submit,
  ready = true,
  initialText = '',
  initialAttachments = [attachment]
}: {
  submit(submission: ComposerSubmission): Promise<void>
  ready?: boolean
  initialText?: string
  initialAttachments?: ComposerAttachment[]
}) {
  const [value, setValue] = useState(initialText)
  const [attachments, setAttachments] = useState(initialAttachments)
  return (
    <Composer
      value={value}
      onChange={setValue}
      attachments={attachments}
      onAttachmentsChange={setAttachments}
      onSubmit={submit}
      canSubmit={ready}
      submitHint="发送"
      chips={null}
      cwd="/work/project"
    />
  )
}

describe('Composer attachment submission', () => {
  it('submits an attachment-only draft with its composed prompt', async () => {
    const submit = vi.fn().mockResolvedValue(undefined)
    render(<Harness submit={submit} />)

    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        text: '',
        prompt: '@src/a.ts',
        attachments: [attachment]
      })
    )
  })

  it('clears text and attachments after a successful submit', async () => {
    const submit = vi.fn().mockResolvedValue(undefined)
    render(<Harness submit={submit} initialText="explain" />)

    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: '移除 a.ts' })).toBeNull())
    // 编辑器的内容更新是异步提交到 DOM 的
    await waitFor(() => expect(screen.getByRole('textbox').textContent).toBe(''))
  })

  it('keeps text and attachments when submit rejects', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('send failed'))
    render(<Harness submit={submit} initialText="explain" />)

    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => expect(submit).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: '移除 a.ts' })).toBeTruthy()
    expect(screen.getByRole('textbox').textContent).toBe('explain')
  })

  it('does not submit while the caller is not ready', () => {
    const submit = vi.fn()
    render(<Harness submit={submit} ready={false} />)

    const button = screen.getByRole('button', { name: '发送' })
    expect(button).toHaveProperty('disabled', true)
    fireEvent.click(button)
    expect(submit).not.toHaveBeenCalled()
  })

  it('keeps text typed while an earlier submission is still pending', async () => {
    let finish!: () => void
    const submit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    render(<Harness submit={submit} initialText="first draft" />)
    const box = screen.getByRole('textbox')

    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    // 模拟用户在发送过程中继续输入
    const editor = (box as unknown as { __lexicalEditor: LexicalEditor }).__lexicalEditor
    await act(async () => {
      editor.update(() => {
        const p = $createParagraphNode().append($createTextNode('newer draft'))
        $getRoot().clear().append(p)
      })
    })
    await act(async () => {
      finish()
      await Promise.resolve()
    })

    expect(box.textContent).toBe('newer draft')
    expect(screen.queryByRole('button', { name: '移除 a.ts' })).toBeNull()
  })

  it('merges overlapping file validations without losing either file', async () => {
    type Finish = (files: FileInfo[]) => void
    const pending = new Map<string, Finish>()
    const info = (path: string): FileInfo => ({
      path,
      name: path.slice(path.lastIndexOf('/') + 1),
      extension: 'ts',
      bytes: 1
    })
    window.desk = {
      files: {
        pathFor: (file) => `/${file.name}`,
        describe: (paths) =>
          new Promise<FileInfo[]>((resolve) => {
            pending.set(paths[0], (files) => resolve(files))
          })
      }
    } as Window['desk']
    const submit = vi.fn().mockResolvedValue(undefined)
    render(<Harness submit={submit} initialAttachments={[]} />)
    const picker = document.querySelector('input[type=file]') as HTMLInputElement

    fireEvent.change(picker, { target: { files: [new File(['a'], 'a.ts')] } })
    fireEvent.change(picker, { target: { files: [new File(['b'], 'b.ts')] } })
    await waitFor(() => expect(pending.size).toBe(2))

    pending.get('/a.ts')?.([info('/a.ts')])
    pending.get('/b.ts')?.([info('/b.ts')])

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '移除 a.ts' })).toBeTruthy()
      expect(screen.getByRole('button', { name: '移除 b.ts' })).toBeTruthy()
    })
  })

  it('输入框里的文件小组件发送时导出为 @相对路径', async () => {
    const submit = vi.fn(async (_submission: ComposerSubmission) => {})
    // 文件小组件会检查路径是否存在
    Object.assign(window, { desk: { files: { stat: async () => ({ '/work/project/src/b.ts': 'file' }) } } })
    render(<Harness submit={submit} initialAttachments={[]} />)
    const editor = (screen.getByRole('textbox') as unknown as { __lexicalEditor: LexicalEditor }).__lexicalEditor
    await act(async () => {
      editor.update(() => {
        const p = $createParagraphNode().append(
          $createTextNode('看看 '),
          new FileNode('/work/project/src/b.ts', '@src/b.ts'),
          $createTextNode(' 的问题')
        )
        $getRoot().clear().append(p)
      })
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(submit).toHaveBeenCalled())
    expect(submit.mock.calls[0]![0]).toMatchObject({ prompt: '看看 @src/b.ts 的问题' })
  })
})
