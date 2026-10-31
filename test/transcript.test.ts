import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { UiBlock } from '../src/shared/chat'
import { Transcript } from '../src/main/transcript'

const fixture: unknown[] = JSON.parse(readFileSync(join(__dirname, 'fixtures/probe-messages.json'), 'utf-8'))

function tools(t: Transcript): Extract<UiBlock, { kind: 'tool' }>[] {
  return t.messages.flatMap((m) => m.blocks).filter((b): b is Extract<UiBlock, { kind: 'tool' }> => b.kind === 'tool')
}

describe('Transcript', () => {
  it('整理完整的流式会话：文本、工具调用和结果', () => {
    const t = new Transcript()
    for (const m of fixture) t.apply(m)

    expect(t.messages.some((m) => m.role === 'user')).toBe(false) // 工具结果不会变成用户气泡
    expect(t.messages.filter((m) => m.role === 'notice')).toHaveLength(2) // 两次中断提示
    const first = t.messages[0]
    expect(first.blocks).toEqual([{ kind: 'text', text: expect.stringContaining('OK') }])

    const write = tools(t).find((b) => b.name === 'Write')!
    expect(write.input.file_path).toMatch(/hello\.txt$/)
    expect(write.result?.isError).toBe(false)

    const plan = tools(t).find((b) => b.name === 'ExitPlanMode')!
    expect(typeof plan.input.plan).toBe('string')
  })

  it('最终消息到达前，流式片段已经能显示', () => {
    const t = new Transcript()
    const firstFinal = fixture.findIndex((m) => (m as { type: string }).type === 'assistant')
    for (const m of fixture.slice(0, firstFinal)) t.apply(m)
    const block = t.messages[0]?.blocks[0]
    expect(block?.kind).toBe('text')
    expect((block as { text: string }).text.length).toBeGreaterThan(0)
  })

  it('同一条消息的多个块按顺序合并', () => {
    const t = new Transcript()
    for (const m of fixture) t.apply(m)
    const withTool = t.messages.find((m) => m.blocks.some((b) => b.kind === 'tool' && b.name === 'Write'))!
    expect(withTool.blocks.map((b) => b.kind)).toEqual(['thinking', 'tool'])
  })

  it('未知历史保留原文并标注未确认；确认的内部说明不分轮', () => {
    const t = new Transcript()
    const text = '你好<system-reminder>内部提示</system-reminder>'
    t.apply({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null })
    t.apply({ type: 'user', is_meta: true, message: { role: 'user', content: '<local-command-caveat>说明</local-command-caveat>' }, parent_tool_use_id: null })
    expect(t.messages).toHaveLength(2)
    expect(t.messages[0]).toMatchObject({ role: 'notice', source: 'unknown', startsTurn: true, blocks: [{ kind: 'text', text }] })
    expect(t.messages[1]).toMatchObject({ role: 'notice', source: 'internal', startsTurn: false })
  })

  it('addUser 立即显示用户刚发出的消息', () => {
    const t = new Transcript()
    t.addUser('帮我看看')
    expect(t.messages[0]).toMatchObject({ role: 'user', blocks: [{ kind: 'text', text: '帮我看看' }] })
    expect(t.takeChanged()).toHaveLength(1)
    expect(t.takeChanged()).toHaveLength(0)
  })

  describe('本地斜杠命令', () => {
    const user = (content: string) => ({ type: 'user', is_meta: true, message: { role: 'user', content }, parent_tool_use_id: null })
    const synthetic = (text: string) => ({
      type: 'assistant',
      message: { id: 'syn', model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text }] },
      parent_tool_use_id: null
    })
    const commands = (t: Transcript) =>
      t.messages.flatMap((m) => m.blocks).filter((b): b is Extract<UiBlock, { kind: 'command' }> => b.kind === 'command')

    it('实时：输入命令后到来的合成消息就是命令输出', () => {
      const t = new Transcript()
      t.addUser('/model sonnet')
      t.apply(synthetic('Set model to `sonnet`'))
      expect(t.messages[0]).toMatchObject({ role: 'user', source: 'human', startsTurn: true, blocks: [{ kind: 'text', text: '/model sonnet' }] })
      expect(commands(t)).toEqual([{ kind: 'command', name: 'model', args: 'sonnet', output: 'Set model to `sonnet`' }])
    })

    it('实时：模型处理的命令（技能）照常显示回复；不是命令时的合成消息仍是普通文本', () => {
      const t = new Transcript()
      t.addUser('/dataviz 画个图')
      t.apply({ type: 'stream_event', event: { type: 'message_start', message: { id: 'm1' } }, parent_tool_use_id: null })
      t.apply(synthetic('API Error'))
      expect(commands(t)).toHaveLength(0)
      expect(t.messages.at(-1)?.blocks).toEqual([{ kind: 'text', text: 'API Error' }])
    })

    it('历史：确认的内部命令保留记录，输出变成命令卡片', () => {
      const t = new Transcript()
      t.apply(user('<command-name>/model</command-name>\n  <command-message>model</command-message>\n  <command-args>sonnet</command-args>'))
      t.apply(user('<local-command-stdout>Set model to \u001b[1msonnet\u001b[22m</local-command-stdout>'))
      t.finish()
      expect(t.messages[0]).toMatchObject({ role: 'notice', source: 'internal', startsTurn: false })
      expect(commands(t)).toEqual([{ kind: 'command', name: 'model', args: 'sonnet', output: 'Set model to sonnet' }])
    })

    it('历史：没保存输出的命令也显示卡片（output 为 null）', () => {
      const t = new Transcript()
      t.apply(user('<command-name>/config</command-name>\n<command-args></command-args>'))
      t.apply(user('下一条消息'))
      t.apply(user('<command-name>/context</command-name>'))
      t.finish()
      expect(t.messages.filter(m => m.source === 'internal')).toHaveLength(3)
      expect(commands(t).map((c) => [c.name, c.output])).toEqual([
        ['config', null],
        ['context', null]
      ])
    })
  })

  it('记录助手消息的 token 用量：流式开始时的输入、结束时的输出', () => {
    const t = new Transcript()
    const ev = (event: unknown) => ({ type: 'stream_event', event, parent_tool_use_id: null })
    t.apply(ev({ type: 'message_start', message: { id: 'm', usage: { input_tokens: 3, cache_read_input_tokens: 100, cache_creation_input_tokens: 20, output_tokens: 1 } } }))
    t.apply(ev({ type: 'message_delta', usage: { output_tokens: 42 } }))
    expect(t.messages[0].usage).toEqual({ input: 3, output: 42, cacheRead: 100, cacheWrite: 20 })
  })

  it('记录消息时间和会话链位置：编辑用户消息时从它前面最后一个链条目分叉', () => {
    const t = new Transcript()
    const ts = '2026-10-31T03:56:00.000Z'
    t.apply({ type: 'user', origin: { kind: 'human' }, uuid: 'u1', timestamp: ts, message: { role: 'user', content: '第一句' }, parent_tool_use_id: null })
    t.apply({ type: 'assistant', uuid: 'a1', timestamp: ts, message: { id: 'm1', role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'Read', input: {} }] }, parent_tool_use_id: null })
    t.apply({ type: 'user', uuid: 'r1', timestamp: ts, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] }, parent_tool_use_id: null })
    // 子代理里的消息不在主链上
    t.apply({ type: 'assistant', uuid: 'sub', timestamp: ts, message: { id: 'm2', role: 'assistant', content: [] }, parent_tool_use_id: 't' })
    t.apply({ type: 'assistant', uuid: 'a2', timestamp: ts, message: { id: 'm3', role: 'assistant', content: [{ type: 'text', text: '好' }] }, parent_tool_use_id: null })
    t.apply({ type: 'user', origin: { kind: 'human' }, uuid: 'u2', timestamp: ts, message: { role: 'user', content: '第二句' }, parent_tool_use_id: null })
    t.addUser('第三句')

    const users = t.messages.filter((m) => m.role === 'user')
    expect(users.map((m) => m.forkFrom)).toEqual([null, 'a2', 'u2'])
    expect(users[0].time).toBe(Date.parse(ts))
    expect(t.messages.find((m) => m.id === 'm3')?.uuid).toBe('a2')
    expect(Math.abs(users[2].time! - Date.now())).toBeLessThan(1000)
  })
})
