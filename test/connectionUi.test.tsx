// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConnectionSettings } from '../src/renderer/components/settings/ConnectionSettings'
import { useDesk } from '../src/renderer/store'
const official = { executable: 'C:\\Users\\name\\.local\\bin\\claude.exe', source: 'installed', version: '2.1.299', configDirectory: 'C:\\Users\\name\\.claude', loggedIn: true, authMethod: 'claude.ai', provider: 'firstParty', error: null }
beforeEach(() => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Windows')
  useDesk.setState({ settings: { theme: 'light', defaultModel: 'sonnet', defaultEffort: null, defaultPermissionMode: 'default', claudePath: null, allowBypass: false } })
  window.desk = { connection: { status: vi.fn().mockResolvedValue(official), login: vi.fn().mockResolvedValue(undefined), pickExecutable: vi.fn(), installationHelp: vi.fn() } } as unknown as Window['desk']
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('offers a terminal command on Mac instead of a Windows-only launcher', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Macintosh')
  render(<ConnectionSettings />)
  await screen.findByText('已检测到官方认证')
  expect(screen.queryByText('打开官方登录终端')).toBeNull()
  fireEvent.click(screen.getByText('复制官方登录命令'))
  await screen.findByText(/登录命令已复制/)
  expect(window.desk.connection.login).toHaveBeenCalledOnce()
})
it('shows detected official authentication without claiming a network check or starting login', async () => {
  render(<ConnectionSettings cwd={'C:\\Project'} />)
  await screen.findByText('已检测到官方认证')
  expect(screen.getByText(/实际网络连通性和模型可用性/)).toBeTruthy()
  expect(window.desk.connection.status).toHaveBeenCalledWith('C:\\Project')
  expect(window.desk.connection.login).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('打开官方登录终端'))
  await screen.findByText(/请完成浏览器授权/)
  expect(window.desk.connection.login).toHaveBeenCalledOnce()
})
it('reports a failed status check and lets the user retry', async () => {
  vi.mocked(window.desk.connection.status).mockRejectedValueOnce(new Error('检测超时'))
  render(<ConnectionSettings />)
  await screen.findByRole('alert')
  await waitFor(() => expect((screen.getByText('重新检测') as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByText('重新检测'))
  await screen.findByText('已检测到官方认证')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('does not mislabel a third-party configuration as official', async () => {
  vi.mocked(window.desk.connection.status).mockResolvedValue({ ...official, source: 'installed', provider: 'bedrock' })
  render(<ConnectionSettings />)
  await screen.findByText('正在使用其他供应商配置')
  expect(screen.queryByText('已检测到官方认证')).toBeNull()
})
