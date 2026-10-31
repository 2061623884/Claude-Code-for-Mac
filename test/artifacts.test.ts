import { mkdtemp, writeFile, rm, symlink, readFile, rename, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ArtifactRepository } from '../src/main/artifacts'
import { emptySessionSummary } from '../src/shared/sessionSummary'
let root: string, repo: ArtifactRepository
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'artifact-test-'))
  repo = new ArtifactRepository(() => join(root, 'index.json'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})
it('collects evidence only, ignores sources, code and ambiguous links, never infers command outputs', async () => {
  for (const name of ['report.md', 'reference.pdf', 'delivered.pdf', 'script.ts', 'command.pdf'])
    await writeFile(join(root, name), 'data')
  const summary = emptySessionSummary()
  summary.sections.changes = ['report.md', 'script.ts'].map((name) => ({
    id: name,
    path: join(root, name),
    title: name,
    description: ''
  }))
  summary.sections.sources = [{ id: 'reference.pdf', path: join(root, 'reference.pdf'), title: '', description: '' }]
  await repo.collect('a', root, summary, [
    {
      id: 'm',
      role: 'assistant',
      parentToolUseId: null,
      blocks: [{ kind: 'text', text: '[参考资料](reference.pdf) [下载产物](delivered.pdf)' }]
    }
  ])
  expect((await repo.snapshot()).items.map((i) => i.name).sort()).toEqual(['delivered.pdf', 'report.md'])
})
it('deduplicates canonical paths, keeps multiple sources and honors manual removal across restarts', async () => {
  const file = join(root, 'file.md'),
    alias = join(root, 'alias.md')
  await writeFile(file, 'original')
  await symlink(file, alias)
  await repo.add(file, { sessionId: 'a', cwd: root, evidence: 'file-tool' })
  await repo.add(alias, { sessionId: 'b', cwd: root, evidence: 'manual' })
  const item = (await repo.snapshot()).items[0]
  expect(item.sources).toHaveLength(2)
  repo.remove(item.id)
  repo = new ArtifactRepository(() => join(root, 'index.json'))
  await repo.add(alias, { sessionId: 'a', cwd: root, evidence: 'file-tool' })
  expect((await repo.snapshot()).items).toHaveLength(0)
  expect(await readFile(file, 'utf8')).toBe('original')
  await repo.add(alias, { sessionId: 'a', cwd: root, evidence: 'manual' })
  expect((await repo.snapshot()).items).toHaveLength(1)
})
it('retains a missing file record and relocates it without modifying content', async () => {
  const file = join(root, 'report.pdf'),
    moved = join(root, 'moved.pdf')
  await writeFile(file, 'report')
  await repo.add(file, { sessionId: 'a', cwd: root, evidence: 'manual' })
  const id = (await repo.snapshot()).items[0].id
  await rename(file, moved)
  expect((await repo.snapshot()).items[0].missing).toBe(true)
  await repo.relocate(id, moved)
  expect((await repo.snapshot()).items[0]).toMatchObject({ id, path: await realpath(moved), missing: false })
})
it('does not guess the base of a relative delivery link after directory changes', async () => {
  await writeFile(join(root, 'report.pdf'), 'could be the wrong report')
  const summary = emptySessionSummary()
  summary.sections.projects = [{ id: root, title: '', path: root, description: '' }, { id: '/other', title: '', path: '/other', description: '' }]
  await repo.collect('a', root, summary, [{ id: 'm', role: 'assistant', parentToolUseId: null, blocks: [{ kind: 'text', text: '[下载报告](report.pdf)' }] }])
  expect((await repo.snapshot()).items).toHaveLength(0)
})
