import { expect, it } from 'vitest'
import {
  emptyOrganization,
  updateOrganization as change,
  recordCompletion,
  isUnread,
  sectionFor
} from '../src/shared/sessionOrganization'
it('keeps section membership and position while pinning, supports moves and deletion without losing the pin', () => {
  let value = change(emptyOrganization(), { kind: 'create', id: 'client', title: '客户' })
  for (const id of ['a', 'b']) value = change(value, { kind: 'move', sessionId: id, sectionId: 'client' })
  value = change(value, { kind: 'pin', sessionId: 'a', pinned: true })
  expect(sectionFor(value, 'a')?.sessions).toEqual(['a', 'b'])
  value = change(value, { kind: 'pin', sessionId: 'a', pinned: false })
  expect(sectionFor(value, 'a')?.sessions).toEqual(['a', 'b'])
  value = change(value, { kind: 'pin', sessionId: 'a', pinned: true })
  value = change(value, { kind: 'remove', id: 'client' })
  expect(value.pinned).toEqual(['a'])
  expect(sectionFor(value, 'a')).toBeUndefined()
})
it('cannot lose another section membership when a stale drag targets a removed section', () => {
  let value = change(emptyOrganization(), { kind: 'create', id: 's', title: 'Section' })
  value = change(value, { kind: 'move', sessionId: 'a', sectionId: 's' })
  expect(() => change(value, { kind: 'move', sessionId: 'a', sectionId: 'missing' })).toThrow()
  expect(sectionFor(value, 'a')?.id).toBe('s')
})
it('deduplicates completion events and refuses a stale read acknowledgement', () => {
  let value = recordCompletion(emptyOrganization(), 'a', 'first')
  value = recordCompletion(value, 'a', 'second')
  expect(recordCompletion(value, 'a', 'first')).toBe(value)
  value = change(value, { kind: 'read', sessionId: 'a', completed: 'first' })
  expect(isUnread(value, 'a')).toBe(true)
  value = change(value, { kind: 'read', sessionId: 'a', completed: 'second' })
  expect(isUnread(value, 'a')).toBe(false)
  expect(isUnread(JSON.parse(JSON.stringify(value)), 'a')).toBe(false)
})
