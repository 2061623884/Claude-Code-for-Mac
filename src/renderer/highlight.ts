// 文件预览的代码高亮（shiki，纯 JS 正则引擎，不需要 WASM）。语言按需加载，浅色/深色两套主题跟随系统。
import { bundledLanguages, createHighlighter, type BundledLanguage, type Highlighter } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

export interface Token {
  content: string
  style?: Record<string, string>
}

const ALIASES: Record<string, string> = {
  yml: 'yaml',
  mjs: 'js',
  cjs: 'js',
  mts: 'ts',
  cts: 'ts',
  h: 'c',
  hpp: 'cpp',
  cc: 'cpp',
  zsh: 'sh',
  bash: 'sh',
  htm: 'html',
  txt: 'text',
  plist: 'xml',
  svg: 'xml'
}

/** 超过这个大小不做高亮，直接显示纯文本 */
const HIGHLIGHT_LIMIT = 200 * 1024

let highlighter: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({ themes: ['github-light', 'github-dark'], langs: [], engine: createJavaScriptRegexEngine() })
  return highlighter
}

export function languageFor(path: string): string | null {
  const name = path.split('/').pop()?.toLowerCase() ?? ''
  if (name === 'dockerfile') return 'docker'
  if (name === 'makefile') return 'make'
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  const lang = ALIASES[ext] ?? ext
  return lang in bundledLanguages ? lang : null
}

/** 按行切好的高亮结果；不支持的语言或文件太大时返回纯文本行 */
export async function highlightLines(code: string, path: string): Promise<Token[][]> {
  const plain = (): Token[][] => code.split('\n').map((line) => [{ content: line }])
  const lang = languageFor(path)
  if (!lang || code.length > HIGHLIGHT_LIMIT) return plain()
  try {
    const hl = await getHighlighter()
    await hl.loadLanguage(lang as BundledLanguage)
    const { tokens } = hl.codeToTokens(code, { lang: lang as BundledLanguage, themes: { light: 'github-light', dark: 'github-dark' } })
    return tokens.map((line) => line.map((t) => ({ content: t.content, style: t.htmlStyle })))
  } catch {
    return plain()
  }
}
