// 识别文字里的文件路径，渲染成文件链接。纯函数。
// 这里只判断「像不像路径」；是否真的存在由主进程检查，不存在的照原样显示。

export interface PathRef {
  /** 写在文字里的路径（可能是相对路径或 ~ 开头） */
  path: string
  line?: number
}

/** 网址、邮件等，不当作文件 */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const LINE_SUFFIX = /(?::(\d+)(?::\d+)?|#L(\d+)(?:-L?\d+)?)$/

/** Markdown 链接地址或行内代码 → 路径（去掉 file://、URL 编码和行号后缀）；不像路径时返回 null */
export function parsePathRef(raw: string): PathRef | null {
  let s = raw.trim()
  if (!s || s.length > 500 || s.includes('\n')) return null
  if (/^file:\/\//i.test(s)) s = s.replace(/^file:\/\//i, '')
  else if (SCHEME.test(s) && !/^[A-Za-z]:[\\/]/.test(s)) return null
  try {
    if (/%[0-9a-f]{2}/i.test(s)) s = decodeURI(s)
  } catch {
    // 不是合法的 URL 编码，按原样处理
  }
  let line: number | undefined
  const m = LINE_SUFFIX.exec(s)
  if (m) {
    line = Number(m[1] ?? m[2])
    s = s.slice(0, m.index)
  }
  if (!looksLikePath(s)) return null
  return line ? { path: s, line } : { path: s }
}

/** 是否像文件路径：绝对路径、~ 开头、带目录的相对路径，或带扩展名的文件名 */
export function looksLikePath(s: string): boolean {
  if (!s || /[\n<>|*?"]/.test(s) || /^\.+$/.test(s)) return false
  if (s.startsWith('/') || s.startsWith('~/') || /^[A-Za-z]:[\\/]/.test(s)) return s.length > 1
  if (/\s/.test(s)) return false // 相对路径里出现空格，多半是普通文字
  if (/^\.{1,2}\//.test(s)) return true
  if (s.includes('/')) return /^[\w.@\-一-鿿]+(\/[\w.@\-一-鿿]+)+\/?$/.test(s) && /[A-Za-z一-鿿]/.test(s)
  return /^[\w\-一-鿿][\w.\-一-鿿]*\.[A-Za-z][A-Za-z0-9]{0,7}$/.test(s)
}

export interface PathMatch {
  start: number
  end: number
  ref: PathRef
}

// 正文里的路径：绝对路径（/、~/ 开头）和 @ 引用（发给 Claude 的文件引用）；前面必须是开头、空白或括号引号
const BARE = /(^|[\s(（"'“‘「《[])(@[^\s"'`<>)\]（）“”‘’「」《》，。；：！？、]+|(?:~\/|\/)[^\s"'`<>)\]（）“”‘’「」《》，。；：！？、]+)/g

/** 找出一段普通文字里的路径（末尾的句号、逗号等标点不算在内） */
export function findBarePaths(text: string): PathMatch[] {
  const out: PathMatch[] = []
  for (const m of text.matchAll(BARE)) {
    let token = m[2]!
    const start = m.index! + m[1]!.length
    token = token.replace(/[.,;:!?)]+$/, (tail) => (LINE_SUFFIX.test(token) && /^:\d/.test(tail) ? tail : ''))
    const body = token.startsWith('@') ? token.slice(1) : token
    if (token.startsWith('@') && !body.includes('/') && !/\.\w+$/.test(body)) continue // @某人，不是文件
    const ref = parsePathRef(body)
    if (!ref || (!token.startsWith('@') && !body.slice(1).includes('/'))) continue
    out.push({ start, end: start + token.length, ref })
  }
  return out
}

/** 把路径解析成绝对路径：~ 换成主目录，相对路径按项目目录解析，去掉 . 和 .. */
export function resolvePath(path: string, cwd?: string, home?: string): string | null {
  let p = path.replace(/\\/g, '/')
  if (p.startsWith('~/')) {
    if (!home) return null
    p = home.replace(/\/$/, '') + p.slice(1)
  } else if (!p.startsWith('/')) {
    if (!cwd) return null
    p = cwd.replace(/\/$/, '') + '/' + p
  }
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return '/' + parts.join('/') + (p.endsWith('/') && parts.length ? '/' : '')
}

/** 路径的最后一段（文件名），目录去掉末尾的 / */
export function fileName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  return trimmed.slice(Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\')) + 1) || trimmed
}

/** 显示用的路径：项目内的文件去掉项目路径前缀 */
export function relativePath(path: string, cwd?: string): string {
  const root = cwd?.replace(/\/$/, '')
  return root && path.startsWith(root + '/') ? path.slice(root.length + 1) : path
}
