import { describe, expect, it } from 'vitest'
import { mergeShellEnv, parseEnv, shouldAdopt } from '../src/main/env'

describe('login shell environment', () => {
  it('parses NUL-separated env output, keeping = inside values', () => {
    expect(parseEnv('A=1\0B=x=y\0\0junk\0')).toEqual({ A: '1', B: 'x=y' })
  })

  it('adopts Claude auth, provider and proxy variables only', () => {
    for (const name of ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'AWS_PROFILE', 'CLOUD_ML_REGION', 'HTTPS_PROXY', 'no_proxy']) expect(shouldAdopt(name)).toBe(true)
    for (const name of ['OPENAI_API_KEY', 'GITHUB_TOKEN', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_CONFIG_DIR']) expect(shouldAdopt(name)).toBe(false)
  })

  it('merges PATH and never overrides variables already set', () => {
    const target: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin', ANTHROPIC_MODEL: 'existing' }
    mergeShellEnv(target, { PATH: '/opt/homebrew/bin:/usr/bin', ANTHROPIC_MODEL: 'shell', ANTHROPIC_API_KEY: 'k', SECRET: 's' })
    expect(target).toEqual({ PATH: '/opt/homebrew/bin:/usr/bin:/bin', ANTHROPIC_MODEL: 'existing', ANTHROPIC_API_KEY: 'k' })
  })
})
