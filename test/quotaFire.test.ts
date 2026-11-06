import { expect, it } from 'vitest'
import { quotaFireLabel } from '../src/shared/quotaFire'
const at = (fiveHour: number | null, weekly: number | null) => quotaFireLabel({ available: true, fiveHour, weekly })
it('maps the 5-hour fire and weekly woodpile onto four states', () => {
  expect(at(80, 60)).toBe('柴火正旺')
  expect(at(20, 60)).toBe('快烧完了')
  expect(at(80, 20)).toBe('余柴不多')
  expect(at(10, 5)).toBe('柴火告急')
  expect(at(21, 21)).toBe('柴火正旺')
})
it('lets the most severe exhausted window win', () => {
  expect(at(0, 60)).toBe('灶火暂歇')
  expect(at(0, 0)).toBe('柴已烧尽')
  expect(at(50, 0)).toBe('柴已烧尽')
})
it('judges a single known window alone and keeps neutral copy without data', () => {
  expect(at(null, 10)).toBe('余柴不多')
  expect(at(10, null)).toBe('快烧完了')
  expect(at(null, null)).toBe('剩余额度')
  expect(quotaFireLabel({ available: false })).toBe('剩余额度')
  expect(quotaFireLabel({})).toBe('生火中…')
  expect(quotaFireLabel({ failed: true })).toBe('火光不明')
  expect(quotaFireLabel({ failed: true, available: true, fiveHour: 80, weekly: 60 })).toBe('柴火正旺')
})
