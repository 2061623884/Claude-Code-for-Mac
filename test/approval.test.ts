import { describe, expect, it } from 'vitest'
import { toPermissionResult } from '../src/main/approval'

const input = { file_path: '/tmp/a.txt', content: 'hi' }
const suggestions = [{ type: 'setMode' as const, mode: 'acceptEdits' as const, destination: 'session' as const }]

describe('toPermissionResult', () => {
  it('允许：原样放行', () =>
    expect(toPermissionResult({ type: 'allow' }, input, suggestions)).toEqual({ behavior: 'allow', updatedInput: input }))

  it('始终允许：带上 SDK 给的建议规则', () =>
    expect(toPermissionResult({ type: 'allowAlways' }, input, suggestions)).toEqual({
      behavior: 'allow',
      updatedInput: input,
      updatedPermissions: suggestions
    }))

  it('拒绝且没有说明：中断，等用户进一步指示', () =>
    expect(toPermissionResult({ type: 'deny' }, input)).toMatchObject({ behavior: 'deny', interrupt: true }))

  it('拒绝并附说明：把说明交给 Claude 继续', () =>
    expect(toPermissionResult({ type: 'deny', message: '改用 pnpm' }, input)).toEqual({ behavior: 'deny', message: '改用 pnpm' }))

  it('回答问题：answers 写进 updatedInput', () =>
    expect(toPermissionResult({ type: 'answers', answers: { 用哪个库: 'zod' } }, { questions: [] })).toEqual({
      behavior: 'allow',
      updatedInput: { questions: [], answers: { 用哪个库: 'zod' } }
    }))

  it('继续完善计划：拒绝并附反馈，不中断', () => {
    const r = toPermissionResult({ type: 'planRevise', feedback: '先写测试' }, { plan: '...' })
    expect(r).toMatchObject({ behavior: 'deny', message: expect.stringContaining('先写测试') })
    expect(r).not.toHaveProperty('interrupt')
  })
})
