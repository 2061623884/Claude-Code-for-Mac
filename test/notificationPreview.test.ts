import { expect, it } from 'vitest'
import { notificationPreview } from '../src/shared/notificationPreview'
it('turns headings, formatting, links and code fences into a compact readable preview', () => {
  expect(notificationPreview('## 已完成\n\n- **修复**了 `app.ts`\n[查看详情](https://example.com)')).toBe('已完成 修复了 app.ts 查看详情')
  expect(notificationPreview('```js\nconst a = 1;\n```')).toBe('const a = 1;')
})
it('bounds long multilingual previews without cutting an emoji surrogate pair', () => {
  const value = notificationPreview('完成😀'.repeat(100))
  expect(Array.from(value)).toHaveLength(160)
  expect(value.endsWith('…')).toBe(true)
  expect(value).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u)
  expect(notificationPreview(' \n\t')).toBe('')
})
