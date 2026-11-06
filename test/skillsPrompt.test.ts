import { expect, it, vi } from 'vitest'
import { buildSkillPrompt } from '../src/shared/skills'

vi.mock('../src/main/sdk', () => ({ loadSdk: vi.fn(), withIdleQuery: vi.fn() }))

it('builds a skill prompt with location, optional fields and skill-creator prefix', () => {
  const prompt = buildSkillPrompt({ name: 'weekly-report', purpose: ' 生成周报 ', trigger: '', details: '三段输出\n每条一行', location: 'user' })
  expect(prompt).toContain('- 名称：weekly-report')
  expect(prompt).toContain('~/.claude/skills/weekly-report/SKILL.md')
  expect(prompt).toContain('- 用途：生成周报')
  expect(prompt).not.toContain('何时使用')
  expect(prompt).toContain('- 补充要求：\n  三段输出\n  每条一行')
  expect(prompt).toContain('/weekly-report 调用')
  const project = buildSkillPrompt({ name: 'lint', purpose: 'x', trigger: '提交前', details: '', location: 'project', creator: 'anthropic-skills:skill-creator' })
  expect(project.startsWith('/anthropic-skills:skill-creator 请帮我创建')).toBe(true)
  expect(project).toContain('.claude/skills/lint/SKILL.md（当前项目内）')
  expect(project).toContain('- 何时使用：提交前')
})

it('waits for pending MCP servers to settle, but gives up at the deadline', async () => {
  const { settledMcpStatus } = await import('../src/main/live/SessionManager')
  const states = [['pending'], ['pending'], ['connected']]
  const q = { mcpServerStatus: vi.fn(async () => states.shift()!.map(status => ({ name: 'a', status }))) }
  expect((await settledMcpStatus(q as never, 1000, 1)).map(s => s.status)).toEqual(['connected'])
  expect(q.mcpServerStatus).toHaveBeenCalledTimes(3)
  const stuck = { mcpServerStatus: vi.fn(async () => [{ name: 'a', status: 'pending' }]) }
  expect((await settledMcpStatus(stuck as never, 20, 5)).map(s => s.status)).toEqual(['pending'])
})
