// @ 引用文件：列出项目里的文件并按输入的关键词排序。git 仓库用 git ls-files（自动遵守 .gitignore），否则自己遍历。
import { execFile } from 'node:child_process'
import { existsSync, unwatchFile as fsUnwatchFile, watchFile as fsWatchFile } from 'node:fs'
import { access, constants, mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { FileInfo, FilePreview, ProjectEntry } from '../shared/types'

const TTL_MS = 30_000
const MAX_FILES = 20_000
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', 'build', 'target', 'venv', '__pycache__', 'Library'])
const BROWSER_SKIP = new Set([...SKIP_DIRS, '.git'])

const cache = new Map<string, { at: number; files: Promise<string[]> }>()

export async function search(cwd: string, query: string): Promise<string[]> {
  let entry = cache.get(cwd)
  if (!entry || Date.now() - entry.at > TTL_MS) {
    entry = { at: Date.now(), files: listFiles(cwd) }
    cache.set(cwd, entry)
  }
  return rankFiles(await entry.files, query, 30)
}

export async function describePaths(paths: string[]): Promise<FileInfo[]> {
  const unique = [...new Set(paths.map((path) => resolve(path)))]
  const results = await Promise.all(
    unique.map(async (path): Promise<FileInfo | null> => {
      const info = await stat(path).catch(() => null)
      if (!info?.isFile()) return null
      const readable = await access(path, constants.R_OK).then(
        () => true,
        () => false
      )
      if (!readable) return null
      return {
        path,
        name: basename(path),
        extension: extname(path).slice(1).toLowerCase(),
        bytes: info.size
      }
    })
  )
  return results.filter((file): file is FileInfo => file !== null)
}

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

export async function listProjectDirectory(projectPath: string, directory: string): Promise<ProjectEntry[]> {
  const root = await realpath(resolve(projectPath))
  const dir = await realpath(resolve(directory))
  if (!inside(root, dir)) throw new Error('只能读取项目目录内的文件')
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .flatMap((entry): ProjectEntry[] => {
      if (entry.name === '.DS_Store') return []
      if (entry.isDirectory() && BROWSER_SKIP.has(entry.name)) return []
      if (entry.isDirectory()) return [{ path: join(dir, entry.name), name: entry.name, kind: 'dir' }]
      if (entry.isFile()) return [{ path: join(dir, entry.name), name: entry.name, kind: 'file' }]
      return []
    })
    .sort((a, b) => Number(a.kind === 'file') - Number(b.kind === 'file') || a.name.localeCompare(b.name))
}

export async function createProjectEntry(
  projectPath: string,
  directory: string,
  kind: ProjectEntry['kind'],
  name: string
): Promise<string> {
  const root = await realpath(resolve(projectPath))
  const parent = await realpath(resolve(directory))
  if (!inside(root, parent)) throw new Error('只能在项目目录内新建')
  const clean = name.trim()
  if (!clean || clean === '.' || clean === '..' || /[\\/\0\r\n]/.test(clean)) throw new Error('名称无效')
  const target = resolve(parent, clean)
  if (!inside(root, target) || parent === target) throw new Error('名称无效')
  if (kind === 'dir') await mkdir(target)
  else await writeFile(target, '', { flag: 'wx' })
  return target
}

/** 文件名开头匹配 > 文件名包含 > 路径包含 > 按顺序模糊匹配；同一档里路径短的在前 */
export function rankFiles(files: string[], query: string, limit: number): string[] {
  const q = query.toLowerCase()
  const scored: [number, string][] = []
  for (const f of files) {
    const path = f.toLowerCase()
    const name = path.slice(path.lastIndexOf('/') + 1)
    const score = !q
      ? 0
      : name.startsWith(q)
        ? 0
        : name.includes(q)
          ? 1
          : path.includes(q)
            ? 2
            : isSubsequence(q, path)
              ? 3
              : -1
    if (score >= 0) scored.push([score, f])
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length || a[1].localeCompare(b[1]))
  return scored.slice(0, limit).map(([, f]) => f)
}

function isSubsequence(q: string, text: string): boolean {
  let i = 0
  for (const ch of text) if (ch === q[i] && ++i === q.length) return true
  return false
}

async function listFiles(cwd: string): Promise<string[]> {
  return (inGitRepo(cwd) && (await gitFiles(cwd))) || walk(cwd)
}

// 只有确实在 git 仓库里才调用 git，避免没装开发者工具的 Mac 弹出安装提示
function inGitRepo(dir: string): boolean {
  for (let d = dir; ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return true
    if (dirname(d) === d) return false
  }
}

function gitFiles(cwd: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    execFile('git', ['ls-files', '-co', '--exclude-standard'], { cwd, maxBuffer: 64 * 1024 * 1024, timeout: 5000 }, (err, out) =>
      resolve(err ? null : out.split('\n').filter(Boolean).slice(0, MAX_FILES))
    )
  })
}

/** 广度优先遍历，跳过隐藏目录和常见的依赖、构建目录 */
async function walk(root: string): Promise<string[]> {
  const files: string[] = []
  const queue = ['']
  while (queue.length && files.length < MAX_FILES) {
    const rel = queue.shift()!
    const entries = await readdir(join(root, rel), { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const path = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) queue.push(path)
      } else if (e.isFile()) files.push(path)
    }
  }
  return files
}

/** 批量检查路径：文件、文件夹或不存在（null）。只接受绝对路径 */
export async function statPaths(paths: string[]): Promise<Record<string, 'file' | 'dir' | null>> {
  const out: Record<string, 'file' | 'dir' | null> = {}
  await Promise.all(
    paths.slice(0, 500).map(async (p) => {
      if (!p.startsWith('/')) return (out[p] = null)
      try {
        const s = await stat(p)
        out[p] = s.isDirectory() ? 'dir' : s.isFile() ? 'file' : null
      } catch {
        out[p] = null
      }
    })
  )
  return out
}

const TEXT_LIMIT = 1024 * 1024
const IMAGE_LIMIT = 15 * 1024 * 1024
const IMAGES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon'
}

/** 右栏预览用：文本（1MB 以内）、图片（data URL），其余只返回类型和大小 */
export async function readForPreview(path: string): Promise<FilePreview> {
  if (!path.startsWith('/')) return { kind: 'missing' }
  let info
  try {
    info = await stat(path)
  } catch {
    return { kind: 'missing' }
  }
  if (info.isDirectory()) return { kind: 'dir' }
  if (!info.isFile()) return { kind: 'missing' }
  const size = info.size
  if (extname(path).toLowerCase() === '.pdf') {
    if (size > 30 * 1024 * 1024) return { kind: 'too-large', size }
    return { kind: 'pdf', size, base64: (await readFile(path)).toString('base64') }
  }
  const mime = IMAGES[extname(path).toLowerCase()]
  if (mime) {
    if (size > IMAGE_LIMIT) return { kind: 'too-large', size }
    return { kind: 'image', size, dataUrl: `data:${mime};base64,${(await readFile(path)).toString('base64')}` }
  }
  if (size > TEXT_LIMIT) return { kind: 'too-large', size }
  const buf = await readFile(path)
  if (buf[0] === 0xff && buf[1] === 0xfe) return { kind: 'text', size, content: buf.subarray(2).toString('utf16le') }
  if (buf[0] === 0xfe && buf[1] === 0xff && buf.length % 2 === 0) return { kind: 'text', size, content: buf.subarray(2).swap16().toString('utf16le') }
  // 前 8KB 里有空字节，基本就是二进制文件
  if (buf.subarray(0, 8192).includes(0)) return { kind: 'binary', size }
  return { kind: 'text', size, content: buf.toString('utf8') }
}

// 预览中的文件：轮询修改时间（编辑器和 Claude 常用「写临时文件再改名」的方式保存，fs.watch 容易丢）
const watchers = new Map<string, number>()

export function watchFile(path: string, onChange: () => void): void {
  if (!path.startsWith('/')) return
  const count = watchers.get(path) ?? 0
  watchers.set(path, count + 1)
  if (count === 0) fsWatchFile(path, { interval: 1000 }, (cur, prev) => cur.mtimeMs !== prev.mtimeMs && onChange())
}

export function unwatchFile(path: string): void {
  const count = watchers.get(path) ?? 0
  if (count <= 1) {
    watchers.delete(path)
    fsUnwatchFile(path)
  } else watchers.set(path, count - 1)
}
