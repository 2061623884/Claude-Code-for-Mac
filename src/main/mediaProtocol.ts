// 右栏音视频预览：desk-media://file/?path=<绝对路径> 按 Range 流式读取本地文件，不把整个文件读进内存。
// 只放行 MEDIA 里的扩展名，其他文件仍走 files:read。
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, isAbsolute } from 'node:path'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { MEDIA } from './files'

const SCHEME = 'desk-media'

/** 必须在 app ready 之前调用 */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }])
}

export function handleMediaProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    const path = new URL(request.url).searchParams.get('path') ?? ''
    const type = MEDIA[extname(path).toLowerCase()]
    if (!isAbsolute(path) || !type) return new Response(null, { status: 404 })
    let size: number
    try {
      const info = await stat(path)
      if (!info.isFile()) return new Response(null, { status: 404 })
      size = info.size
    } catch {
      return new Response(null, { status: 404 })
    }
    const headers = { 'Content-Type': type.mime, 'Accept-Ranges': 'bytes' }
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') ?? '')
    if (!range || (!range[1] && !range[2])) {
      return new Response(stream(path, 0, size - 1), { status: 200, headers: { ...headers, 'Content-Length': String(size) } })
    }
    // bytes=-N 表示最后 N 个字节
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    return new Response(stream(path, start, end), {
      status: 206,
      headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` }
    })
  })
}

function stream(path: string, start: number, end: number): ReadableStream {
  return Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
}
