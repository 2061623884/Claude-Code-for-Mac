import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const PROXY_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']
let pending: Promise<NodeJS.ProcessEnv> | undefined

/** macOS 手动 HTTP(S) 代理。HTTPSProxy 表示 CONNECT 代理，连接代理本身仍用 HTTP。 */
export function parseSystemProxy(text: string): NodeJS.ProcessEnv {
  const value = (name: string): string | undefined => new RegExp(`^\\s*${name} : (.+)$`, 'm').exec(text)?.[1].trim()
  // PAC 按目标 URL 分流，不能用一个环境变量代替。
  if (value('ProxyAutoConfigEnable') === '1' || value('ProxyAutoDiscoveryEnable') === '1') return {}
  const env: NodeJS.ProcessEnv = {}
  for (const kind of ['HTTP', 'HTTPS']) {
    const host = value(`${kind}Proxy`)
    const port = Number(value(`${kind}Port`))
    if (value(`${kind}Enable`) !== '1' || !host || /[\s/@?#]/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) continue
    try {
      const hostname = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
      env[`${kind}_PROXY`] = new URL(`http://${hostname}:${port}`).origin
    } catch { /* 非法系统配置不传给 CLI */ }
  }
  if (Object.keys(env).length) {
    const block = /ExceptionsList : <array> \{([^}]+)\}/.exec(text)?.[1] ?? ''
    const exceptions = [...block.matchAll(/^\s*\d+ : (.+)$/gm)].map(match => match[1].trim())
      .filter(host => host !== '<local>').map(host => host.replace(/^\*\./, '.'))
    env.NO_PROXY = [...new Set(['localhost', '127.0.0.1', '::1', ...exceptions])].join(',')
  }
  return env
}

export function proxyEnvironment(system: NodeJS.ProcessEnv, inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (PROXY_KEYS.some(key => inherited[key] !== undefined)) return { ...inherited }
  const env = { ...system, ...inherited }
  if (inherited.no_proxy !== undefined && inherited.NO_PROXY === undefined) delete env.NO_PROXY
  return env
}

/** 只合并同时发生的读取，后续创建会话时重新读取，以跟随代理开关或端口变化。 */
export function readSystemProxy(): Promise<NodeJS.ProcessEnv> {
  if (process.platform !== 'darwin') return Promise.resolve({})
  return pending ??= run('/usr/sbin/scutil', ['--proxy'], { timeout: 2000, maxBuffer: 64 * 1024 })
    .then(({ stdout }) => parseSystemProxy(stdout), () => ({}))
    .finally(() => { pending = undefined })
}
