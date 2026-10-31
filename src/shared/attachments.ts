export interface ComposerAttachment {
  path: string
  name: string
  extension: string
  bytes: number
}

export interface ComposerSubmission {
  text: string
  prompt: string
  attachments: ComposerAttachment[]
}

export function normalizeAbsolutePath(path: string): string {
  const windowsPath = /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\')
  const slashed = windowsPath ? path.replace(/\\/g, '/') : path
  if (slashed === '/') return '/'
  return slashed.replace(/\/+$/, '')
}

export function referenceFor(path: string, cwd?: string): string {
  const target = normalizeAbsolutePath(path)
  const root = cwd ? normalizeAbsolutePath(cwd) : ''
  const prefix = root === '/' ? '/' : root + '/'
  const relative = root && target.startsWith(prefix) ? target.slice(prefix.length) : target
  return '@' + relative
}

export function buildPrompt(text: string, attachments: ComposerAttachment[], cwd?: string): string {
  const body = text.trim()
  const references = attachments.map((file) => referenceFor(file.path, cwd))
  if (references.length === 0) return body
  if (body === '') return references.join('\n')
  return `${references.join('\n')}\n\n${body}`
}

export function mergeAttachments(
  current: ComposerAttachment[],
  incoming: ComposerAttachment[]
): ComposerAttachment[] {
  const seen = new Set(current.map((file) => file.path))
  const next = [...current]
  for (const file of incoming) {
    if (seen.has(file.path)) continue
    seen.add(file.path)
    next.push(file)
  }
  return next
}

export function attachmentTitle(text: string, attachments: ComposerAttachment[]): string {
  return text.trim() || attachments.map((file) => file.name).join('、') || '新会话'
}
