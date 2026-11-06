// Isolated smoke test of desktop controls against the bundled CLI. Never sends a model prompt.
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = await mkdtemp(join(tmpdir(), 'desk-command-probe-'))
const configDir = join(root, 'config')
await mkdir(configDir)
const previousConfig = process.env.CLAUDE_CONFIG_DIR
process.env.CLAUDE_CONFIG_DIR = configDir
const sdkUrl = import.meta.resolve('@anthropic-ai/claude-agent-sdk')
const cli = resolve('node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude')
let session
let timer
try {
  await build({
    stdin: { contents: `export { LiveSession } from ${JSON.stringify(resolve('src/main/live/LiveSession.ts'))}; export { Transcript } from ${JSON.stringify(resolve('src/main/transcript.ts'))};`, resolveDir: process.cwd(), sourcefile: 'probe-entry.ts' },
    outfile: join(root, 'probe.cjs'), bundle: true, platform: 'node', format: 'cjs',
    plugins: [{ name: 'isolated-sdk', setup(build) {
      build.onResolve({ filter: /^\.\.\/sdk$/ }, () => ({ path: 'sdk', namespace: 'probe' }))
      build.onResolve({ filter: /^\.\.\/store$/ }, () => ({ path: 'store', namespace: 'probe' }))
      build.onResolve({ filter: /^\.\/sdk$/ }, () => ({ path: 'sdk', namespace: 'probe' }))
      build.onLoad({ filter: /^store$/, namespace: 'probe' }, () => ({ contents: 'export function read() { return {settings:{allowBypass:false}} }', loader: 'js' }))
      build.onLoad({ filter: /^sdk$/, namespace: 'probe' }, () => ({ contents: `
        const dynamicImport = new Function('specifier', 'return import(specifier)');
        export async function withIdleQuery(){ throw new Error('Unexpected idle query') }
        export function claudeExecutable(){ return ${JSON.stringify(cli)} }
        export async function loadSdk(){
          const sdk = await dynamicImport(${JSON.stringify(sdkUrl)});
          return { ...sdk, query(params){
            const q = sdk.query({ ...params, options: { ...params.options, cwd: ${JSON.stringify(root)}, persistSession: false,
              env: { ...process.env, CLAUDE_CONFIG_DIR: ${JSON.stringify(configDir)} }, pathToClaudeCodeExecutable: ${JSON.stringify(cli)} }});
            const original = q[Symbol.asyncIterator].bind(q);
            q[Symbol.asyncIterator] = async function*(){ for await(const m of original()){
              if(m.type === 'stream_event' || (m.type === 'assistant' && m.message.model !== '<synthetic>')) { q.close(); throw new Error('Unexpected model output'); }
              yield m;
            }};
            return q;
          }};
        }
      `, loader: 'js' }))
    }}]
  })
  const { LiveSession, Transcript } = createRequire(import.meta.url)(join(root, 'probe.cjs'))
  session = new LiveSession({ sessionId: '00000000-0000-4000-8000-000000000001', cwd: root, resume: false,
    options: { model: 'opus', mode: 'default', effort: 'high', fastMode: false }, transcript: new Transcript(root),
    emit: () => {}, onClosed: () => {} })
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { session.close(); reject(new Error('Probe timed out after 20 seconds')) }, 20000) })
  await Promise.race([(async () => {
    await session.start()
    await session.readyForControls()
    try {
      await session.setFastMode(true, false)
      await session.refreshRuntime()
      assert.ok(['on', 'cooldown'].includes(session.runtime.fastMode), 'Fast did not activate')
      assert.equal(session.runtime.fastModeReason, undefined, 'stale Fast disabled reason')
      console.log('PASS Fast enabled without stale reason')
    } catch (error) {
      const known = /^(?:快速模式未开启：账号未启用额外用量|快速模式未生效：(free|preference|extra_usage_disabled|network_error|unknown|not_first_party|disabled_by_env|model_not_allowed|sdk_opt_in_required|pending))$/
      if (!known.test(String(error.message))) throw error
      console.log('Fast rejected by CLI:', error.message)
    }
    await session.setFastMode(false, false)
    await session.refreshRuntime()
    assert.equal(session.runtime.fastMode, 'off')
    console.log('PASS Fast disabled')
    for (const model of ['haiku', 'opus']) {
      await session.setModel(model)
      await session.refreshRuntime()
      assert.ok(session.runtime.model?.includes(model), `Model ${model} not applied: ${session.runtime.model}`)
      console.log('PASS model', model)
    }
    for (const effort of ['low', 'high']) {
      await session.setEffort(effort)
      await session.refreshRuntime()
      assert.equal(session.runtime.effort, effort)
      console.log('PASS effort', effort)
    }
    for (const mode of ['plan', 'default']) {
      await session.setMode(mode)
      await session.refreshRuntime()
      console.log('PASS permission request accepted by CLI', mode)
    }
    await session.applySetting('language', 'Chinese')
    console.log('PASS language effective setting')
    await session.applySetting('outputStyle', 'default')
    console.log('PASS output style effective setting')
    await session.autoCompact('200k')
    console.log('PASS auto compact setting')
  })(), timeout])
} finally {
  clearTimeout(timer)
  session?.close()
  if (previousConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = previousConfig
  await rm(root, { recursive: true, force: true })
}
