import { expect, it, vi } from 'vitest'
import type { Query } from '@anthropic-ai/claude-agent-sdk'
import { readConfigState } from '../src/main/claudeConfigProtocol'

const query = (reply: unknown) => ({ request: vi.fn().mockResolvedValue(reply) }) as unknown as Query

it('adapts the private control response while discarding unrelated fields', async () => {
  const state = { effective: { language: 'Chinese' }, sources: [{ source: 'userSettings', settings: { language: 'Chinese' } }] }
  expect(await readConfigState(query({ response: { ...state, errors: [], privateCache: 'ignored' } }))).toEqual(state)
})

it.each([null, {}, { response: null }, { response: { effective: [], sources: [] } },
  { response: { effective: {}, sources: [null] } },
  { response: { effective: {}, sources: [{ source: 'userSettings', settings: null }] } },
  { response: { effective: {}, sources: [{ source: 1, settings: {} }] } }
])('rejects malformed protocol responses: %j', async reply => {
  await expect(readConfigState(query(reply))).rejects.toThrow('格式无法识别')
})

it('rejects unavailable protocol methods and incomplete config loads', async () => {
  await expect(readConfigState({} as Query)).rejects.toThrow('不支持')
  await expect(readConfigState(query({ response: { effective: {}, sources: [], errors: [{ message: 'bad config' }] } }))).rejects.toThrow('未能加载')
})
