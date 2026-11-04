import { expect, it } from 'vitest'
import { parseSystemProxy, proxyEnvironment } from '../src/main/systemProxy'
const settings = `<dictionary> {
 HTTPEnable : 1
 HTTPProxy : 127.0.0.1
 HTTPPort : 7897
 HTTPSEnable : 1
 HTTPSProxy : 127.0.0.1
 HTTPSPort : 7897
 ExceptionsList : <array> {
  0 : *.local
  1 : 10.0.0.0/8
  2 : <local>
 }
}`
it('passes the configured CONNECT proxy and local bypass list to a CLI environment', () => {
  const parsed = parseSystemProxy(settings)
  expect(parsed).toEqual({ HTTP_PROXY: 'http://127.0.0.1:7897', HTTPS_PROXY: 'http://127.0.0.1:7897', NO_PROXY: 'localhost,127.0.0.1,::1,.local,10.0.0.0/8' })
  const inherited = { PATH: '/bin', ANTHROPIC_API_KEY: 'fixture' }
  expect(proxyEnvironment(parsed, inherited)).toEqual({ ...parsed, ...inherited })
  expect(inherited).toEqual({ PATH: '/bin', ANTHROPIC_API_KEY: 'fixture' })
})
it.each(['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'])('preserves explicit %s, including an intentional empty value', key => {
  for (const value of ['http://custom:8000', '']) {
    expect(proxyEnvironment(parseSystemProxy(settings), { [key]: value })).toEqual({ [key]: value })
  }
})
it('honors explicit bypass rules and handles disabled, invalid and PAC configurations', () => {
  expect(proxyEnvironment(parseSystemProxy(settings), { no_proxy: 'example.com' }).NO_PROXY).toBeUndefined()
  expect(proxyEnvironment(parseSystemProxy(settings), { NO_PROXY: 'example.com' }).NO_PROXY).toBe('example.com')
  expect(parseSystemProxy(settings.replaceAll('Enable : 1', 'Enable : 0'))).toEqual({})
  expect(parseSystemProxy(settings.replaceAll('7897', '70000'))).toEqual({})
  expect(parseSystemProxy(settings + '\n ProxyAutoConfigEnable : 1')).toEqual({})
  expect(parseSystemProxy(settings.replaceAll('127.0.0.1', 'user@host'))).toEqual({})
  expect(parseSystemProxy(settings.replaceAll('127.0.0.1', '::1')).HTTPS_PROXY).toBe('http://[::1]:7897')
})
