// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RightPanel } from '../src/renderer/components/right/RightPanel'
import { useLayout } from '../src/renderer/layoutStore'
import { useDesk } from '../src/renderer/store'
import { Dialog } from '../src/renderer/components/ui/Dialog'
vi.mock('../src/renderer/components/right/TerminalPane', () => ({ TerminalPane: () => <div>内嵌终端</div> }))
vi.mock('../src/renderer/components/right/BrowserPane', () => ({ BrowserPane: ({ active }: { active: boolean }) => <div data-testid="browser-pane" data-active={active}>内嵌浏览器</div> }))
vi.mock('../src/renderer/components/files/FilePreview', () => ({ FilePreview: ({ path }: { path: string }) => <div>预览 {path}</div> }))
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
  useLayout.setState({ pages: [{ id: 'page:home', kind: 'start' }], openFiles: [], rightTab: 'page:home', rightOpen: true, expanded: false })
  useDesk.setState({ projects: [{ id: 'p', path: '/project', name: 'project', addedAt: 0, collapsed: false }] })
  window.desk = { workspace: { closePage: vi.fn().mockResolvedValue(undefined), onShortcut: () => () => {} }, files: { list: vi.fn().mockResolvedValue([{ name: 'README.md', path: '/project/README.md', kind: 'file' }]) } } as unknown as Window['desk']
})
afterEach(cleanup)
it('plus opens a separate start page, with three working entries and no file-creation menu', () => {
  render(<RightPanel projectId="p" />)
  fireEvent.click(screen.getByRole('button', { name: '新建侧栏页面' }))
  expect(useLayout.getState().pages).toHaveLength(2)
  expect(screen.getAllByRole('tab', { name: '开始' })).toHaveLength(2)
  expect(screen.getByRole('button', { name: /工作区文件/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /新建终端/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /浏览器/ })).toBeTruthy()
  expect(screen.queryByText('更多工具')).toBeNull()
  expect(screen.queryByText('新建文件')).toBeNull()
})
it('opens a file preview from the start page without requiring a chat session', async () => {
  render(<RightPanel projectId="p" />)
  fireEvent.click(screen.getByRole('button', { name: /工作区文件/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'README.md' }))
  expect(screen.getByText('预览 /project/README.md')).toBeTruthy()
  expect(screen.getByRole('tab', { name: 'README.md' }).getAttribute('aria-selected')).toBe('true')
})
it('changes the current start page into a terminal, and closing it returns to a usable page', () => {
  render(<RightPanel projectId="p" />)
  fireEvent.click(screen.getByRole('button', { name: /新建终端/ }))
  expect(screen.getByText('内嵌终端')).toBeTruthy()
  expect(useLayout.getState().pages[0].cwd).toBe('/project')
  fireEvent.click(screen.getByRole('button', { name: '关闭终端' }))
  expect(screen.getByRole('button', { name: /工作区文件/ })).toBeTruthy()
})

it('hides the native browser for generic dialogs outside the desk store', () => {
  useLayout.setState({ pages: [{ id: 'page:browser', kind: 'browser' }], rightTab: 'page:browser' })
  render(<RightPanel projectId="p" />)
  expect(screen.getByTestId('browser-pane').getAttribute('data-active')).toBe('true')
  const modal = render(<Dialog title="移除项目" footer={null} onClose={() => {}}>确认移除</Dialog>)
  expect(screen.getByTestId('browser-pane').getAttribute('data-active')).toBe('false')
  modal.unmount()
  expect(screen.getByTestId('browser-pane').getAttribute('data-active')).toBe('true')
})
