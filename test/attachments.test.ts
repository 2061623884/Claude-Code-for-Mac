import { describe, expect, it } from 'vitest'
import {
  attachmentTitle,
  buildPrompt,
  mergeAttachments,
  referenceFor,
  type ComposerAttachment
} from '../src/shared/attachments'

const file = (path: string): ComposerAttachment => ({
  path,
  name: path.slice(path.lastIndexOf('/') + 1),
  extension: 'ts',
  bytes: 10
})

describe('referenceFor', () => {
  it('uses a project-relative path for a child file', () => {
    expect(referenceFor('/work/project/src/a.ts', '/work/project')).toBe('@src/a.ts')
  })

  it('keeps absolute paths outside the project', () => {
    expect(referenceFor('/work/other/a.ts', '/work/project')).toBe('@/work/other/a.ts')
  })

  it('does not treat a sibling directory as a project child', () => {
    expect(referenceFor('/work/project-other/a.ts', '/work/project')).toBe('@/work/project-other/a.ts')
  })

  it('supports a project rooted at the filesystem root', () => {
    expect(referenceFor('/src/a.ts', '/')).toBe('@src/a.ts')
  })

  it('preserves backslashes in POSIX filenames', () => {
    expect(referenceFor('/work/project/src/a\\b.ts', '/work/project')).toBe('@src/a\\b.ts')
  })
})

describe('buildPrompt', () => {
  it('puts references before trimmed user text', () => {
    expect(buildPrompt('  explain this  ', [file('/work/project/src/a.ts')], '/work/project')).toBe(
      '@src/a.ts\n\nexplain this'
    )
  })

  it('separates multiple references with one newline', () => {
    expect(
      buildPrompt('compare', [file('/work/project/src/a.ts'), file('/work/project/src/b.ts')], '/work/project')
    ).toBe('@src/a.ts\n@src/b.ts\n\ncompare')
  })

  it('supports attachment-only prompts', () => {
    expect(buildPrompt('', [file('/work/project/src/a.ts')], '/work/project')).toBe('@src/a.ts')
  })

  it('returns trimmed text unchanged when there are no attachments', () => {
    expect(buildPrompt('  hello  ', [], '/work/project')).toBe('hello')
  })
})

describe('mergeAttachments', () => {
  it('deduplicates by canonical path and keeps insertion order', () => {
    expect(mergeAttachments([file('/a.ts')], [file('/a.ts'), file('/b.ts')]).map((f) => f.path)).toEqual([
      '/a.ts',
      '/b.ts'
    ])
  })
})

describe('attachmentTitle', () => {
  it('uses text before attachment names', () => {
    expect(attachmentTitle('fix it', [file('/a.ts')])).toBe('fix it')
  })

  it('falls back to names for attachment-only drafts', () => {
    expect(attachmentTitle('', [file('/a.ts'), file('/b.ts')])).toBe('a.ts、b.ts')
  })
})
