import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)
export async function gitDiff(cwd: string, source: string): Promise<string> {
  const run = async (args: string[]) => (await exec('git', ['-c', 'core.quotepath=false', ...args], { cwd, maxBuffer: 4 * 1024 * 1024 })).stdout
  if (source === 'working') return run(['diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--'])
  if (source !== 'branch') throw new Error('无效比较来源')
  let base: string
  try { base = (await run(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])).trim() }
  catch { base = (await run(['show-ref', '--verify', '--quiet', 'refs/heads/main']).then(() => 'main').catch(() => 'master')) }
  return run(['diff', '--no-ext-diff', '--no-textconv', base + '...HEAD', '--'])
}
