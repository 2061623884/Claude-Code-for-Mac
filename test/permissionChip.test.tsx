// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PermissionChip } from '../src/renderer/components/newSession/Composer'
import { useDesk } from '../src/renderer/store'
import type { Settings } from '../src/shared/types'

afterEach(cleanup)
const settings: Settings = { theme: 'system', defaultModel: 'opus', defaultEffort: 'medium', defaultPermissionMode: 'default', allowBypass: true, claudePath: null }

it('keeps the actual bypass label when the setting is disabled, without offering it as a new choice', () => {
  useDesk.setState({ settings, demo: null })
  const onChange = vi.fn()
  const view = render(<PermissionChip value="bypassPermissions" onChange={onChange} />)
  expect(screen.getByRole('button', { name: '跳过所有权限' })).toBeTruthy()
  // 设置变更后重新挂载，模拟从设置页回到原会话。
  view.unmount()
  useDesk.setState({ settings: { ...settings, allowBypass: false } })
  render(<PermissionChip value="bypassPermissions" onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: '跳过所有权限' }))
  expect(screen.queryByRole('menuitem', { name: /跳过所有权限/ })).toBeNull()
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('menuitem', { name: /默认/ }))
  expect(onChange).toHaveBeenCalledExactlyOnceWith('default')
})

it('allows selecting bypass when enabled', () => {
  useDesk.setState({ settings, demo: null })
  const onChange = vi.fn()
  render(<PermissionChip value="default" onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: '默认' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /跳过所有权限/ }))
  expect(onChange).toHaveBeenCalledExactlyOnceWith('bypassPermissions')
})
