export interface BrowserState {
  url: string
  title: string
  loading: boolean
  back: boolean
  forward: boolean
  error: string | null
}
export interface ViewBounds { x: number; y: number; width: number; height: number }
export function browserUrl(input: string): string {
  const text = input.trim()
  if (!text) throw new Error('请输入网址')
  const explicit = /^[a-z][a-z\d+.-]*:/i.test(text) && !/^(localhost|[\w.-]+\.\w+):\d+(?:\/|$)/i.test(text)
  const url = new URL(explicit ? text : `${/^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(text) ? 'http' : 'https'}://${text}`)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('只支持 http 和 https 网页')
  if (url.username || url.password) throw new Error('网址不能包含用户名或密码')
  return url.href
}
