import { expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ dialog: {}, shell: {} }))
vi.mock('../src/main/sdk', () => ({ claudeRuntime: vi.fn() }))
import { parseAuthentication, posixLoginCommand, powershellLoginCommand, powershellResumeCommand } from '../src/main/connection'

it('quotes a macOS executable without evaluating shell expressions', () => {
  expect(posixLoginCommand("/Users/O'Brien/$(bad)/claude")).toBe("'/Users/O'\\''Brien/$(bad)/claude' auth login")
})

it('only exposes safe metadata from official authentication status', () => {
  const parsed = parseAuthentication(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', configDirectory: 'C:\\Users\\name\\.claude', apiKey: 'secret', accessToken: 'secret', email: 'private@example.com' }))
  expect(parsed).toEqual({ loggedIn: true, authMethod: 'claude.ai', provider: 'firstParty', configDirectory: 'C:\\Users\\name\\.claude' })
  expect(JSON.stringify(parsed)).not.toContain('secret')
})
it('distinguishes signed out, third-party and invalid responses', () => {
  expect(parseAuthentication('{"loggedIn":false,"authMethod":"none"}').loggedIn).toBe(false)
  expect(parseAuthentication('{"loggedIn":true,"apiProvider":"bedrock"}').provider).toBe('bedrock')
  expect(() => parseAuthentication('{}')).toThrow('有效的登录状态')
})
it('quotes the chosen executable as a literal PowerShell argument', () => {
  expect(powershellLoginCommand("C:\\O'Brien $(bad)\\claude.exe")).toBe("& 'C:\\O''Brien $(bad)\\claude.exe' auth login")
})
it('quotes the project and session without PowerShell interpolation', () => {
  expect(powershellResumeCommand("C:\\O'Brien\\claude.exe", "C:\\中文 $(whoami)\\project's", 'session-id')).toBe("Set-Location -LiteralPath 'C:\\中文 $(whoami)\\project''s'\r\n& 'C:\\O''Brien\\claude.exe' --resume 'session-id'")
})
