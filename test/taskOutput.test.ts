import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { LiveSession } from '../src/main/live/LiveSession'
import { Transcript } from '../src/main/transcript'
import { readTrackedTaskOutput } from '../src/main/taskOutput'
import * as protocol from '../src/main/sessionControlProtocol'
vi.mock('../src/main/sdk', () => ({ loadSdk: vi.fn(), claudeExecutable: () => undefined }))
vi.mock('../src/main/store', () => ({ read: () => ({ settings: { allowBypass: false } }) }))
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
it('reads the completed workflow output instead of the shell-only control', async () => {
  const root = await mkdtemp(join(tmpdir(), 'task-output-')); directories.push(root)
  const path = join(root, 'workflow.output')
  await writeFile(path, JSON.stringify({ result: { sum: 5, verified: true } }))
  const transcript = new Transcript()
  const live = new LiveSession({ sessionId: 'test', cwd: root, resume: false, options: { model: 'opus', mode: 'default', effort: 'high' }, transcript, emit() {}, onClosed() {} })
  const control = vi.spyOn(protocol, 'readTaskOutput').mockResolvedValue({ output: 'shell', truncated: false })
  const update = (id: string, patch: Record<string, unknown>) => transcript.apply({ type: 'system', subtype: 'task_notification', task_id: id, ...patch })
  update('w1', { task_type: 'local_workflow', status: 'completed', output_file: path })
  expect(JSON.parse((await live.taskOutput('w1')).output).result).toEqual({ sum: 5, verified: true })
  expect(control).not.toHaveBeenCalled()
  update('w2', { task_type: 'local_workflow', status: 'running' })
  expect((await live.taskOutput('w2')).output).toContain('尚未生成输出')
  update('w2', { task_type: 'local_workflow', status: 'stopped' })
  expect((await live.taskOutput('w2')).output).toBe('工作流已停止，尚未生成结果。')
  await writeFile(path, '')
  update('w2', { task_type: 'local_workflow', status: 'stopped', output_file: path })
  expect((await live.taskOutput('w2')).output).toBe('工作流已停止，尚未生成结果。')
  const query = {} as import('@anthropic-ai/claude-agent-sdk').Query
  const ready = vi.spyOn(live as unknown as { query(): Promise<typeof query> }, 'query').mockResolvedValue(query)
  expect(await live.taskOutput('shell1')).toEqual({ output: 'shell', truncated: false })
  expect(control).toHaveBeenCalledWith(query, 'shell1')
  ready.mockRestore(); control.mockRestore()
  live.close()
})
it('bounds output previews and reports missing files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'task-output-')); directories.push(root)
  const path = join(root, 'large.output')
  await writeFile(path, 'x'.repeat(100000))
  const output = await readTrackedTaskOutput(path)
  expect(output).toHaveLength(65536 + '\n…（输出已截断）'.length)
  await expect(readTrackedTaskOutput(join(root, 'missing'))).rejects.toThrow()
})

it('keeps sessions with running background work out of idle reclamation', async () => {
  const { SessionRuntimes } = await import('../src/main/live/SessionRuntimes')
  const runtimes = new SessionRuntimes()
  const make = (tasks: Record<string, unknown>[]) => {
    const transcript = new Transcript()
    const live = new LiveSession({ sessionId: 'x', cwd: '/', resume: false, options: { model: 'opus', mode: 'default', effort: 'high' }, transcript, emit() {}, onClosed() {} })
    tasks.forEach((task, i) => transcript.apply({ type: 'system', subtype: 'task_started', task_id: String(i), ...task }))
    return live
  }
  runtimes.add('server', make([{ task_type: 'local_bash', status: 'running' }]))
  runtimes.add('foreground', make([{ task_type: 'local_agent', status: 'running', is_backgrounded: false }]))
  runtimes.add('done', make([{ task_type: 'local_bash', status: 'completed' }]))
  expect(runtimes.idle().map(([id]) => id)).toEqual(['foreground', 'done'])
})
