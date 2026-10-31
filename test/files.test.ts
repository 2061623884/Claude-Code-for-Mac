import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProjectEntry, describePaths, listProjectDirectory, rankFiles } from '../src/main/files'

const files = ['README.md', 'src/main/index.ts', 'src/renderer/App.tsx', 'src/renderer/components/chat/ChatView.tsx', 'docs/app-notes.md', 'app/main.ts']

describe('rankFiles', () => {
  it('没有关键词时按路径长短列出', () => {
    expect(rankFiles(files, '', 2)).toEqual(['README.md', 'app/main.ts'])
  })
  it('文件名开头匹配优先于路径中间匹配', () => {
    expect(rankFiles(files, 'app', 10)).toEqual(['docs/app-notes.md', 'src/renderer/App.tsx', 'app/main.ts'])
  })
  it('支持按顺序的模糊匹配', () => {
    expect(rankFiles(files, 'chv', 10)).toEqual(['src/renderer/components/chat/ChatView.tsx'])
  })
  it('匹配目录名', () => {
    expect(rankFiles(files, 'main/', 10)).toEqual(['src/main/index.ts'])
  })
})

describe('describePaths', () => {
  it('只保留普通文件，并忽略目录和缺失路径', async () => {
    const root = await mkdtemp(join(tmpdir(), 'claude-desk-files-'))
    const file = join(root, 'notes.md')
    const dir = join(root, 'folder')
    await writeFile(file, 'hello')
    await mkdir(dir)
    try {
      expect(await describePaths([file, dir, join(root, 'missing.md'), file])).toEqual([
        { path: file, name: 'notes.md', extension: 'md', bytes: 5 }
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it.skipIf(typeof process.getuid === 'function' && process.getuid() === 0)('忽略内容不可读的文件', async () => {
    const root = await mkdtemp(join(tmpdir(), 'claude-desk-files-'))
    const file = join(root, 'private.txt')
    await writeFile(file, 'secret')
    await chmod(file, 0o000)
    try {
      expect(await describePaths([file])).toEqual([])
    } finally {
      await chmod(file, 0o600)
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('project file browser', () => {
  it('lists directories first and hides dependency or metadata noise', async () => {
    const root = await mkdtemp(join(tmpdir(), 'claude-desk-tree-'))
    await mkdir(join(root, 'src'))
    await mkdir(join(root, 'docs'))
    await mkdir(join(root, 'node_modules'))
    await writeFile(join(root, 'README.md'), '# project')
    await writeFile(join(root, '.DS_Store'), '')
    try {
      expect(await listProjectDirectory(root, root)).toEqual([
        expect.objectContaining({ name: 'docs', kind: 'dir' }),
        expect.objectContaining({ name: 'src', kind: 'dir' }),
        expect.objectContaining({ name: 'README.md', kind: 'file' })
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('creates files and folders only inside the project root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'claude-desk-tree-'))
    try {
      const folder = await createProjectEntry(root, root, 'dir', 'notes')
      const file = await createProjectEntry(root, folder, 'file', 'draft.md')
      expect((await listProjectDirectory(root, folder)).map((entry) => entry.name)).toEqual(['draft.md'])
      await expect(createProjectEntry(root, root, 'file', '../outside.md')).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects symlinks that escape the project root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'claude-desk-tree-'))
    const outside = await mkdtemp(join(tmpdir(), 'claude-desk-outside-'))
    await symlink(outside, join(root, 'escape'))
    try {
      await expect(listProjectDirectory(root, join(root, 'escape'))).rejects.toThrow()
      await expect(createProjectEntry(root, join(root, 'escape'), 'file', 'outside.txt')).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})

describe('file previews', () => {
  it('reads code, Markdown, images, PDF and UTF-16 text', async () => {
    const { readForPreview } = await import('../src/main/files')
    const root = await mkdtemp(join(tmpdir(), 'claude-preview-'))
    try {
      await writeFile(join(root, 'hello.ts'), 'export const answer = 42')
      await writeFile(join(root, 'hello.md'), '# 预览')
      await writeFile(join(root, 'hello.html'), '<h1>HTML preview</h1>')
      await writeFile(join(root, 'hello.png'), Buffer.from('iVBORw0KGgo=', 'base64'))
      await writeFile(join(root, 'hello.pdf'), '%PDF-1.4\n')
      await writeFile(join(root, 'hello.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('中文文本', 'utf16le')]))
      for (const name of ['hello.ts', 'hello.md', 'hello.html', 'hello.txt']) expect(await readForPreview(join(root, name))).toMatchObject({ kind: 'text' })
      expect(await readForPreview(join(root, 'hello.txt'))).toMatchObject({ content: '中文文本' })
      expect(await readForPreview(join(root, 'hello.png'))).toMatchObject({ kind: 'image' })
      expect(await readForPreview(join(root, 'hello.pdf'))).toMatchObject({ kind: 'pdf' })
      expect(await readForPreview(join(root, 'missing.txt'))).toEqual({ kind: 'missing' })
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
