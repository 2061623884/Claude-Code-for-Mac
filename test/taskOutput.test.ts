import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { LiveSession } from '../src/main/live/LiveSession'
import { Transcript } from '../src/main/transcript'
import { readTrackedTaskOutput } from '../src/main/taskOutput'
vi.mock('../src/main/sdk', () => ({ loadSdk: vi.fn(), claudeExecutable: () => undefined }))
vi.mock('../src/main/store', () => ({ read: () => ({ settings: { allowBypass: false } }) }))
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
it('reads the completed workflow output instead of the shell-only control', async () => {
  const root = await mkdtemp(join(tmpdir(), 'task-output-')); directories.push(root)
  const path = join(root, 'workflow.output')
  await writeFile(path, JSON.stringify({ result: { sum: 5, verified: true } }))
  const live = new LiveSession({ sessionId: 'test', cwd: root, resume: false, options: { model: 'opus', mode: 'default', effort: 'high' }, transcript: new Transcript(), emit() {}, onClosed() {} })
  const control = vi.spyOn(live, 'control').mockResolvedValue({ output: 'shell' })
  live.tasks.set('w1', { task_type: 'local_workflow', status: 'completed', output_file: path })
  expect(JSON.parse((await live.taskOutput('w1')).output).result).toEqual({ sum: 5, verified: true })
  expect(control).not.toHaveBeenCalled()
  live.tasks.set('w2', { task_type: 'local_workflow', status: 'running' })
  expect((await live.taskOutput('w2')).output).toContain('尚未生成输出')
  live.tasks.set('w2', { task_type: 'local_workflow', status: 'stopped' })
  expect((await live.taskOutput('w2')).output).toBe('工作流已停止，尚未生成结果。')
  await writeFile(path, '')
  live.tasks.set('w2', { task_type: 'local_workflow', status: 'stopped', output_file: path })
  expect((await live.taskOutput('w2')).output).toBe('工作流已停止，尚未生成结果。')
  expect(await live.taskOutput('shell1')).toEqual({ output: 'shell' })
  expect(control).toHaveBeenCalledWith({ subtype: 'get_task_output', task_id: 'shell1' })
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
