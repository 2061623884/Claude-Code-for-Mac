import { describe, expect, it } from 'vitest'
import type { UiMessage } from '../src/shared/chat'
import { collectFileChanges, toolFilePath, turnsOf } from '../src/shared/fileChanges'

const tool = (id: string, name: string, input: Record<string, unknown>, result = '完成', isError = false) => ({
  kind: 'tool' as const,
  id,
  name,
  input,
  result: { text: result, isError }
})
const msg = (role: UiMessage['role'], blocks: UiMessage['blocks'], parentToolUseId: string | null = null): UiMessage => ({
  id: Math.random().toString(36),
  role,
  blocks,
  parentToolUseId
})

describe('collectFileChanges', () => {
  it('汇总每个文件的增删行数，最近改动的排在前面；失败的调用不算', () => {
    const messages = [
      msg('user', [{ kind: 'text', text: '改一下' }]),
      msg('assistant', [
        tool('t1', 'Edit', { file_path: '/p/a.ts', old_string: 'x\n', new_string: 'y\nz\n' }),
        tool('t2', 'Write', { file_path: '/p/b.md', content: '1\n2\n3\n' }, 'File created successfully at: /p/b.md'),
        tool('t3', 'Edit', { file_path: '/p/c.ts', old_string: 'a', new_string: 'b' }, '出错了', true)
      ]),
      msg('assistant', [tool('t4', 'MultiEdit', { file_path: '/p/a.ts', edits: [{ old_string: 'q\n', new_string: '' }] })])
    ]
    const changes = collectFileChanges(messages)
    expect(changes.map((c) => c.path)).toEqual(['/p/a.ts', '/p/b.md'])
    expect(changes[0]).toMatchObject({ added: 2, removed: 2, created: false })
    expect(changes[0].edits.map((e) => e.toolId)).toEqual(['t1', 't4'])
    expect(changes[1]).toMatchObject({ added: 3, removed: 0, created: true })
  })

  it('没有结果（还在运行）的调用不算', () => {
    const running = { kind: 'tool' as const, id: 't', name: 'Edit', input: { file_path: '/a', old_string: 'a', new_string: 'b' } }
    expect(collectFileChanges([msg('assistant', [running])])).toEqual([])
  })
})

describe('turnsOf', () => {
  it('每条用户消息开始新的一轮；子代理里的消息不分轮', () => {
    const turns = turnsOf([
      msg('assistant', [{ kind: 'text', text: '开场' }]),
      msg('user', [{ kind: 'text', text: '1' }]),
      msg('assistant', []),
      msg('user', [{ kind: 'text', text: '子代理' }], 'tool-1'),
      msg('user', [{ kind: 'text', text: '2' }])
    ])
    expect(turns.map((t) => t.length)).toEqual([1, 3, 1])
  })
})

describe('toolFilePath', () => {
  it('只有读写文件的工具有路径', () => {
    expect(toolFilePath('Edit', { file_path: '/a.ts' })).toBe('/a.ts')
    expect(toolFilePath('NotebookEdit', { notebook_path: '/n.ipynb' })).toBe('/n.ipynb')
    expect(toolFilePath('Bash', { file_path: '/a.ts' })).toBeNull()
    expect(toolFilePath('Read', {})).toBeNull()
  })
})
