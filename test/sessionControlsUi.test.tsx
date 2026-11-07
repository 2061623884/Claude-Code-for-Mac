// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionControlsPane } from '../src/renderer/components/right/SessionControlsPane'
afterEach(cleanup)

it('uses normalized rules and targets the typed removal endpoint', async () => {
  const rules = vi.fn().mockResolvedValue({ managedOnly: false, rules: [{ rule: 'Read', source: 'localSettings', behavior: 'allow', editability: 'persistent' }] })
  const changeRule = vi.fn().mockResolvedValue(undefined)
  window.desk = { chat: { rules, changeRule } } as unknown as Window['desk']
  render(<SessionControlsPane sessionId="s" cwd="/project" active initialTab="rules" />)
  fireEvent.click(await screen.findByRole('button', { name: '撤销规则 Read' }))
  await waitFor(() => expect(changeRule).toHaveBeenCalledWith('s', '/project', { source: 'localSettings', behavior: 'allow', rule: 'Read', remove: true }))
})

it('reads git differences without starting or controlling a chat runtime', async () => {
  const diff = vi.fn().mockResolvedValue('+changed')
  window.desk = { files: { diff } } as unknown as Window['desk']
  render(<SessionControlsPane sessionId="s" cwd="/project" active />)
  expect(await screen.findByText('+changed')).toBeTruthy()
  expect(diff).toHaveBeenCalledWith('/project', 'working')
  fireEvent.change(screen.getByLabelText('比较来源'), { target: { value: 'branch' } })
  await waitFor(() => expect(diff).toHaveBeenCalledWith('/project', 'branch'))
})
