// 从访达启动时，进程只有 /usr/bin:/bin 这样的极简 PATH，hooks 和 MCP 里用到的 node 等命令会找不到。
// 启动时向登录 shell 读取一次 PATH 并合并进来。只读 PATH，绝不读取或注入 API Key 等其他变量。
import { execFileSync } from 'node:child_process'

export function adoptLoginShellPath(): void {
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const out = execFileSync(shell, ['-ilc', 'printf "__PATH__%s__PATH__" "$PATH"'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const path = /__PATH__(.*)__PATH__/.exec(out)?.[1]
    if (!path) return
    const merged = [...path.split(':'), ...(process.env.PATH ?? '').split(':')].filter(Boolean)
    process.env.PATH = [...new Set(merged)].join(':')
  } catch {
    // 读取失败就保留原 PATH，登录与对话本身不依赖它
  }
}
