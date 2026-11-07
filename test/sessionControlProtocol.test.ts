import { expect, it, vi } from 'vitest'
import type { Query } from '@anthropic-ai/claude-agent-sdk'
import { readPermissionRules, readTaskOutput } from '../src/main/sessionControlProtocol'
const query = (response: unknown) => ({ request: vi.fn().mockResolvedValue(response) }) as unknown as Query
const state = { rules: [{ rule: 'Read', source: 'session', behavior: 'allow', editability: 'session', privateField: 'secret' }], managedOnly: false }

it.each([false, true])('normalizes rules and strips SDK details with wrapped=%s', async wrapped => {
  const value = { state, privateField: 'secret' }
  const rules = await readPermissionRules(query(wrapped ? { response: value } : value))
  expect(rules).toEqual({ managedOnly: false, rules: [{ rule: 'Read', source: 'session', behavior: 'allow', editability: 'session' }] })
})
it('rejects malformed or partially loaded rules before they reach the renderer', async () => {
  await expect(readPermissionRules(query({ state: { ...state, rules: [null] } }))).rejects.toThrow('格式')
  await expect(readPermissionRules(query({ state: { ...state, errors: ['bad settings'] } }))).rejects.toThrow('配置')
})
it('validates output and renders terminal bytes as plain text', async () => {
  await expect(readTaskOutput(query({ response: { output: '\x1b[32mok\x1b[0m', truncated: true } }), 'shell')).resolves.toEqual({ output: 'ok', truncated: true })
  await expect(readTaskOutput(query({ output: 42 }), 'shell')).rejects.toThrow('格式')
})
