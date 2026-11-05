// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ReplyLanguagePicker } from '../src/renderer/components/settings/ReplyLanguagePicker'
afterEach(cleanup)
it('labels the native default and saves presets without requiring typed internal values', () => {
  const save = vi.fn()
  const view = render(<ReplyLanguagePicker id="language" value="default" disabled={false} onSave={save} />)
  expect(screen.getByRole('option', { name: '自动（不指定语言）' }).getAttribute('value')).toBe('default')
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '简体中文' } })
  expect(save).toHaveBeenLastCalledWith('简体中文')
  view.rerender(<ReplyLanguagePicker id="language" value="简体中文" disabled={false} onSave={save} />)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'default' } })
  expect(save).toHaveBeenLastCalledWith('default')
})
it('preserves an existing custom language and only saves another language on submit', () => {
  const save = vi.fn()
  render(<ReplyLanguagePicker id="language" value="Italiano" disabled={false} onSave={save} />)
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('Italiano')
  expect(screen.getByRole('option', { name: '自定义：Italiano' })).toBeTruthy()
  expect(save).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '__desktop_custom_language__' } })
  fireEvent.change(screen.getByLabelText('自定义回复语言'), { target: { value: 'ไทย' } })
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(save).toHaveBeenCalledWith('ไทย')
})
it('keeps unknown and policy-locked values honest', () => {
  const view = render(<ReplyLanguagePicker id="language" value={null} disabled={true} onSave={vi.fn()} />)
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('')
  expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
  view.rerender(<ReplyLanguagePicker id="language" value="Chinese" disabled={true} onSave={vi.fn()} />)
  expect(screen.getByRole('option', { name: '中文' })).toBeTruthy()
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('Chinese')
})
