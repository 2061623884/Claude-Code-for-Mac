import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { commandText, parseCommandOutput, parseTokenCount, resetTextZh } from '../src/shared/commands'
import { formatBytes } from '../src/shared/format'

// 真实的命令输出（claude 2.1.301）
const out: Record<string, string> = JSON.parse(readFileSync(join(__dirname, 'fixtures/command-outputs.json'), 'utf-8'))

describe('parseCommandOutput', () => {
  it('/context：总量、按类别拆分（不含剩余空间、预留和按需加载的工具），其余作为明细', () => {
    const v = parseCommandOutput('context', out.context)
    expect(v).toMatchObject({ kind: 'context', model: 'claude-opus-5-5', used: 24_400, max: 1_000_000, percent: 2 })
    if (v.kind !== 'context') return
    expect(v.parts.map((p) => p.name)).toEqual(['System prompt', 'System tools', 'Memory files', 'Skills', 'Messages'])
    expect(v.parts[0].tokens).toBe(2_800)
    expect(v.details).toMatch(/^### Memory Files/)
  })

  it('/usage：每个限额窗口的百分比和重置时间，其余作为明细', () => {
    const v = parseCommandOutput('usage', out.usage)
    expect(v).toMatchObject({
      kind: 'usage',
      windows: [
        { label: '当前会话（5 小时）', percent: 2, reset: '10月31日 15:29' },
        { label: '本周（所有模型）', percent: 15, reset: '11月3日 00:59' }
      ]
    })
    if (v.kind === 'usage') expect(v.details).toMatch(/^What's contributing/)
  })

  it('/model：当前值和可选模型', () => {
    const v = parseCommandOutput('model', out.model)
    expect(v.kind).toBe('choice')
    if (v.kind !== 'choice') return
    expect(v.current).toBe('Current model: Opus 5.5 (default) (effort: high)')
    expect(v.options.map((o) => o.value)).toEqual(['sonnet', 'opus', 'haiku', 'fable', 'best', 'sonnet[1m]', 'opus[1m]', 'fable[1m]', 'opusplan', 'default'])
  })

  it('/effort、/advisor：从用法说明里取选项', () => {
    const effort = parseCommandOutput('effort', out.effort)
    expect(effort).toMatchObject({ kind: 'choice', current: null })
    if (effort.kind === 'choice') expect(effort.options.map((o) => o.value)).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'auto'])
    expect(parseCommandOutput('advisor', out.advisor)).toMatchObject({ kind: 'choice', current: 'Advisor: off' })
  })

  it('/output-style：带说明的选项，并标出当前项', () => {
    const v = parseCommandOutput('output-style', out['output-style'])
    if (v.kind !== 'choice') throw new Error(v.kind)
    expect(v.options[0]).toEqual({ value: 'default', detail: undefined, current: true })
    expect(v.options.find((o) => o.value === 'Concise')?.detail).toMatch(/tersely/)
    expect(v.options).toHaveLength(5)
  })

  it('/config：每项设置和可选值，自由输入的项没有选项', () => {
    const v = parseCommandOutput('config', out.config)
    if (v.kind !== 'config') throw new Error(v.kind)
    expect(v.items.find((i) => i.key === 'editor')?.values).toEqual(['normal', 'vim'])
    expect(v.items.find((i) => i.key === 'language')?.values).toEqual([])
    expect(v.items.find((i) => i.key === 'switchModelsOnFlag')?.values).toEqual(['Switch automatically', 'Ask each time'])
  })

  it('单行结果和多行纯文本', () => {
    expect(parseCommandOutput('mcp', out.mcp)).toMatchObject({ kind: 'line' })
    expect(parseCommandOutput('model', 'Set model to `sonnet (claude-sonnet-5-5)`')).toEqual({ kind: 'line', text: 'Set model to `sonnet (claude-sonnet-5-5)`' })
    expect(parseCommandOutput('autocompact', out.autocompact)).toMatchObject({ kind: 'text', markdown: false })
    expect(parseCommandOutput('context', '## 标题\n内容')).toMatchObject({ kind: 'text', markdown: true })
  })
})

describe('辅助函数', () => {
  it('parseTokenCount', () => {
    expect(parseTokenCount('24.4k')).toBe(24_400)
    expect(parseTokenCount('1m')).toBe(1_000_000)
    expect(parseTokenCount('~480')).toBe(480)
    expect(parseTokenCount('n/a')).toBeNull()
  })

  it('resetTextZh', () => {
    expect(resetTextZh('Oct 31 at 3:29pm (Asia/Taipei)')).toBe('10月31日 15:29')
    expect(resetTextZh('12am')).toBe('00:00')
    expect(resetTextZh('tomorrow')).toBe('tomorrow')
  })
})

describe('commandText / formatBytes', () => {
  it('拼出命令原文、格式化文件大小', () => {
    expect(commandText('model', 'sonnet')).toBe('/model sonnet')
    expect(commandText('usage', '')).toBe('/usage')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
