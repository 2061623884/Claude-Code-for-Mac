import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { access, realpath, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, basename, extname, resolve, isAbsolute } from 'node:path'
import { homedir } from 'node:os'
import type { UiMessage } from '../shared/chat'
import type { SessionSummaryData } from '../shared/sessionSummary'
import { parsePathRef, resolvePath } from '../shared/fileLinks'
import {
  ARTIFACT_EXTENSIONS,
  type ArtifactSnapshot,
  type ArtifactSource,
  type LocalArtifact
} from '../shared/artifacts'
interface Data extends ArtifactSnapshot {
  excluded: string[]
  version: 1
}
export class ArtifactRepository {
  private data?: Data
  constructor(
    private filename: () => string,
    private publish: () => void = () => {}
  ) {}
  private read(): Data {
    if (!this.data) {
      const file = this.filename()
      const raw = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Data) : undefined
      this.data =
        raw?.version === 1 && Array.isArray(raw.items) && Array.isArray(raw.excluded)
          ? raw
          : { version: 1, revision: 0, items: [], excluded: [] }
    }
    return this.data
  }
  private save(next: Data): void {
    next.revision++
    const file = this.filename()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file + '.tmp', JSON.stringify(next))
    renameSync(file + '.tmp', file)
    this.data = next
    this.publish()
  }
  get(id: string): LocalArtifact {
    const item = this.read().items.find((x) => x.id === id)
    if (!item) throw new Error('产物记录不存在')
    return structuredClone(item)
  }
  async snapshot(): Promise<ArtifactSnapshot> {
    const data = structuredClone(this.read())
    const items = await Promise.all(
      data.items.map(async (item) => ({
        ...item,
        missing: !(await stat(item.path)
          .then(async (s) => {
            await access(item.path)
            return s.isFile()
          })
          .catch(() => false))
      }))
    )
    return { revision: data.revision, items }
  }
  async add(path: string, source: ArtifactSource): Promise<void> {
    const absolute = resolve(path),
      canonical = await realpath(absolute)
    const info = await stat(canonical)
    if (!info.isFile()) throw new Error('只能加入普通文件')
    await access(canonical)
    const current = this.read()
    if (source.evidence !== 'manual' && (current.excluded.includes(absolute) || current.excluded.includes(canonical)))
      return
    const next = structuredClone(current)
    let item = next.items.find((x) => x.path === canonical)
    if (!item) {
      item = {
        id: randomUUID(),
        path: canonical,
        name: basename(canonical),
        type: extname(canonical).slice(1).toLowerCase(),
        sources: []
      }
      next.items.push(item)
    }
    const previous = item.sources.find((s) => s.sessionId === source.sessionId)
    if (previous && source.evidence !== 'manual') return
    if (previous) Object.assign(previous, source)
    else item.sources.push(source)
    if (source.evidence === 'manual') next.excluded = next.excluded.filter((p) => p !== absolute && p !== canonical)
    this.save(next)
  }
  remove(id: string): void {
    const next = structuredClone(this.read()),
      item = this.get(id)
    next.items = next.items.filter((x) => x.id !== id)
    next.excluded = [...new Set([...next.excluded, item.path])]
    this.save(next)
  }
  async relocate(id: string, path: string): Promise<void> {
    const original = this.get(id),
      canonical = await realpath(path)
    if (!(await stat(canonical)).isFile()) throw new Error('请选择普通文件')
    const next = structuredClone(this.read()),
      item = next.items.find((x) => x.id === id)
    if (!item) throw new Error('产物已移除')
    const other = next.items.find((x) => x.path === canonical && x.id !== id)
    if (other) {
      other.sources = [
        ...other.sources,
        ...item.sources.filter((s) => !other.sources.some((o) => o.sessionId === s.sessionId))
      ]
      next.items = next.items.filter((x) => x.id !== id)
    } else
      Object.assign(item, {
        path: canonical,
        name: basename(canonical),
        type: extname(canonical).slice(1).toLowerCase()
      })
    next.excluded = [...new Set([...next.excluded, original.path])].filter((p) => p !== canonical)
    this.save(next)
  }
  async collect(sessionId: string, cwd: string, summary: SessionSummaryData, messages: UiMessage[]): Promise<void> {
    const paths = new Map<string, ArtifactSource['evidence']>()
    for (const item of summary.sections.changes) if (item.path) paths.set(item.path, 'file-tool')
    for (const message of messages)
      if (message.role === 'assistant' && !message.parentToolUseId)
        for (const block of message.blocks)
          if (block.kind === 'text') {
            // Only explicit Markdown delivery links, never free text, command guesses or mtimes.
            for (const match of block.text.matchAll(/\[[^\]\n]+\]\((?:<([^>]+)>|([^\s)]+))\)/g)) {
              const label = match[0].slice(0, match[0].indexOf(']'))
              const before = block.text.slice(Math.max(0, match.index! - 80), match.index)
              if (
                !/下载|导出|另存|交付|download|export/i.test(label) &&
                !/已生成|已保存|生成的文件|输出文件|成果文件|generated file|saved (?:to|as)/i.test(before)
              )
                continue
              const ref = parsePathRef(match[1] ?? match[2])
              // Historical or changed working directories do not prove the base of a relative delivery link.
        if (ref && !isAbsolute(ref.path) && !ref.path.startsWith('~/') &&
            (summary.historyIncomplete || summary.sections.projects.some(item => item.path && resolve(item.path) !== resolve(cwd)))) continue
        const path = ref && resolvePath(ref.path, cwd, homedir())
              if (path && !paths.has(path)) paths.set(path, 'delivery-link')
            }
          }
    for (const [path, evidence] of paths) {
      if (!ARTIFACT_EXTENSIONS.has(extname(path).slice(1).toLowerCase())) continue
      // A missing/unreadable candidate is not an artifact. Existing indexed files remain visible as missing.
      await this.add(path, { sessionId, cwd, evidence }).catch(() => {})
    }
  }
}
