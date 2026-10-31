// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { documentHtml, columnLabel } from '../src/renderer/components/files/OfficePreview'
it('retains document text, images and tables while removing executable markup and navigation', () => {
  const html = documentHtml('<h1>中文文档</h1><table><tr><td colspan="2">42</td></tr></table><img src="data:image/png;base64,AA==" onerror="alert(1)"><script>alert(2)</script><iframe src="file:///etc/passwd"></iframe><a href="javascript:alert(3)">link</a><form action="https://example.com">send</form>')
  const document = new DOMParser().parseFromString(html, 'text/html')
  expect(document.querySelector('h1')?.textContent).toBe('中文文档')
  expect(document.querySelector('td')?.getAttribute('colspan')).toBe('2')
  expect(document.querySelector('img')?.getAttribute('src')).toContain('data:image/png')
  expect(document.querySelector('script,iframe,form,[onerror],[href]')).toBeNull()
  expect(document.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain("default-src 'none'")
})
it('labels columns after Z and up to the Excel limit', () => {
  expect([0,25,26,701,702,16383].map(columnLabel)).toEqual(['A','Z','AA','ZZ','AAA','XFD'])
})
