import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createHumanSubmissionRepository } from '../src/main/humanSubmissionRepository'
import { Transcript } from '../src/main/transcript'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
it('restores exact submitted text with a fresh repository and transcript after restart', () => {
  const root = mkdtempSync(join(tmpdir(), 'human-submissions-')); roots.push(root)
  const repo = createHumanSubmissionRepository(() => root)
  const submission = { uuid: 'human', text: '  <local-command-stdout>真人原文</local-command-stdout>\n', time: 123 }
  repo.save('session', [submission])
  const restarted = createHumanSubmissionRepository(() => root)
  const t = new Transcript(undefined, undefined, restarted.load('session'))
  t.apply({ type: 'user', uuid: 'human', is_meta: true, message: { content: 'expanded input' } })
  expect(t.messages[0]).toMatchObject({ id: 'human', source: 'human', time: 123, blocks: [{ kind: 'text', text: submission.text }] })
  expect(restarted.load('missing')).toEqual([])
  expect(() => restarted.save('../outside', [])).toThrow('无效')
  writeFileSync(join(root, 'session.json'), 'corrupt')
  expect(() => restarted.load('session')).toThrow()
  expect(readFileSync(join(root, 'session.json'), 'utf8')).toBe('corrupt')
})
