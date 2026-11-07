// 从访达启动时，进程只有 /usr/bin:/bin 这样的极简 PATH，也拿不到用户在 .zshrc 等文件里配置的变量。
// 启动时向登录 shell 读取一次环境，合并 PATH，并补上 Claude Code 认证、服务商和代理相关的变量，
// 让在终端里能用的 claude 配置（API Key、Bedrock、Vertex、网关、代理等）在桌面端开箱即用。
// 其余变量一概不取；已经存在的变量不覆盖。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
let loading: Promise<void> | undefined
const MARK = '__CLAUDE_DESK_ENV__'

/** 和 Claude Code 相关、需要从登录 shell 继承的变量 */
const PREFIXES = ['ANTHROPIC_', 'CLAUDE_CODE_', 'AWS_', 'VERTEX_REGION_']
const NAMES = new Set([
  'CLOUD_ML_REGION', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT',
  'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy', 'ALL_PROXY', 'all_proxy',
  'NODE_EXTRA_CA_CERTS', 'API_TIMEOUT_MS', 'MAX_THINKING_TOKENS', 'DISABLE_TELEMETRY', 'DISABLE_ERROR_REPORTING', 'DISABLE_AUTOUPDATER'
])
/** 由 Claude Code 或 SDK 在运行时设置的会话变量，不能从 shell 继承（比如应用是从某个 claude 会话里启动的） */
const SESSION = /^CLAUDE_CODE_(ENTRYPOINT|SESSION_ID|CHILD_SESSION|SESSION_ATTENDED|EXECPATH|MESSAGING_|SSE_PORT)/

export function shouldAdopt(name: string): boolean {
  if (SESSION.test(name)) return false
  return NAMES.has(name) || PREFIXES.some(prefix => name.startsWith(prefix))
}

/** 解析 `env -0` 的输出 */
export function parseEnv(output: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const entry of output.split('\0')) {
    const i = entry.indexOf('=')
    if (i > 0) env[entry.slice(0, i)] = entry.slice(i + 1)
  }
  return env
}

/** 把登录 shell 的环境合并进当前环境：PATH 合并去重，其余只补白名单里且尚未设置的变量 */
export function mergeShellEnv(target: NodeJS.ProcessEnv, shell: Record<string, string>): void {
  if (shell.PATH) {
    const merged = [...shell.PATH.split(':'), ...(target.PATH ?? '').split(':')].filter(Boolean)
    target.PATH = [...new Set(merged)].join(':')
  }
  for (const [name, value] of Object.entries(shell)) {
    if (shouldAdopt(name) && target[name] === undefined) target[name] = value
  }
}

export function adoptLoginShellEnv(): Promise<void> {
  return loading ??= readShellEnv()
}

async function readShellEnv(): Promise<void> {
  // Explorer already supplies the Windows user/system environment. Do not execute
  // a Unix login shell or import WSL settings into a native Windows process.
  if (process.platform === 'win32') return
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    // 用标记包住 env 输出，忽略 shell 配置文件自己打印的内容
    const { stdout } = await run(shell, ['-ilc', `printf '${MARK}'; command env -0; printf '${MARK}'`], {
      encoding: 'utf-8',
      timeout: 3000,
      maxBuffer: 4 * 1024 * 1024
    })
    const body = stdout.split(MARK)[1]
    if (body) mergeShellEnv(process.env, parseEnv(body))
  } catch {
    // 读取失败就保留原环境，钥匙串里的 claude.ai 登录本身不依赖它
  }
}
