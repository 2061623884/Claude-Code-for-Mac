import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
const temp = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => temp.root } }))
import { activityRepository, flushActivityRepository } from '../src/main/activityRepository'
import { SessionActivity } from '../src/main/sessionActivity'
afterEach(() => { flushActivityRepository(); if (temp.root) rmSync(temp.root, { recursive: true, force: true }) })
it('restores the same evidence from pending writes and from disk', () => {
  temp.root = mkdtempSync(join(tmpdir(), 'summary-repository-'))
  const activity = new SessionActivity('/project'); activity.reference('@notes.md')
  activityRepository.save('session-one', activity.export())
  expect(activityRepository.load('session-one')).toEqual(activity.export())
  flushActivityRepository()
  expect(activityRepository.load('session-one')).toEqual(activity.export())
  expect(activityRepository.load('another-session')).toBeUndefined()
})
