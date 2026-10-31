import { expect, it } from 'vitest'
import { browserUrl } from '../src/shared/workspace'
it('accepts websites and local development servers', () => {
  expect(browserUrl('example.com')).toBe('https://example.com/')
  expect(browserUrl('localhost:3000')).toBe('http://localhost:3000/')
  expect(browserUrl('127.0.0.1:8080/test')).toBe('http://127.0.0.1:8080/test')
  expect(browserUrl('http://localhost:4173')).toBe('http://localhost:4173/')
})
it('does not turn browser input into file, script, or credential access', () => {
  for (const value of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,test', 'https://user:pass@example.com']) expect(() => browserUrl(value)).toThrow()
})
