// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TerminalPane } from '../src/renderer/components/right/TerminalPane'
import { BrowserPane } from '../src/renderer/components/right/BrowserPane'
import { useLayout } from '../src/renderer/layoutStore'
vi.mock('@xterm/xterm', () => ({ Terminal: class {
  loadAddon() {} open() {} write() {} writeln() {} dispose() {} focus() {}
  onData() { return { dispose() {} } } onResize() { return { dispose() {} } }
} }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }))
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  window.desk = {
    workspace: { closePage: vi.fn().mockResolvedValue(undefined) },
    terminal: { open: vi.fn().mockResolvedValue({ output: 'previous output', exited: true }), close: vi.fn().mockResolvedValue(undefined), onData: () => () => {}, onExit: () => () => {} },
    browser: { open: vi.fn().mockResolvedValue({ url: 'https://example.com', title: 'Example', loading: false, back: true, forward: false, error: null }), close: vi.fn().mockResolvedValue(undefined), bounds: vi.fn().mockResolvedValue(undefined), onState: () => () => {} }
  } as unknown as Window['desk']
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('unmounting and returning to a terminal reattaches without closing the shell', async () => {
  const view = render(<TerminalPane id="page:test" cwd="/tmp" active />)
  await screen.findByText('终端已退出')
  view.unmount()
  expect(window.desk.terminal.close).not.toHaveBeenCalled()
  render(<TerminalPane id="page:test" cwd="/tmp" active />)
  await waitFor(() => expect(window.desk.terminal.open).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByText('重新启动'))
  await waitFor(() => expect(window.desk.terminal.open).toHaveBeenCalledTimes(3))
  expect(window.desk.terminal.close).toHaveBeenCalledTimes(1)
})
it('unmounting a browser hides its view and reattaches to the existing page on return', async () => {
  const view = render(<BrowserPane id="page:web" active />)
  await screen.findByDisplayValue('https://example.com')
  view.unmount()
  expect(window.desk.browser.close).not.toHaveBeenCalled()
  expect(window.desk.browser.bounds).toHaveBeenCalledWith('page:web', null)
  render(<BrowserPane id="page:web" active />)
  await screen.findByDisplayValue('https://example.com')
  expect(window.desk.browser.open).toHaveBeenCalledTimes(2)
})
it('closing a page explicitly disposes its resources once, even with no mounted pane', () => {
  useLayout.setState({ pages: [{ id: 'page:test', kind: 'terminal', cwd: '/tmp' }], rightTab: 'page:test' })
  useLayout.getState().closePage('page:test')
  useLayout.getState().closePage('page:test')
  expect(window.desk.workspace.closePage).toHaveBeenCalledExactlyOnceWith('page:test')
})
