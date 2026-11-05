import { open } from 'node:fs/promises'

/** Read only the output path supplied by a tracked SDK task, with a bounded preview. */
export async function readTrackedTaskOutput(path: string): Promise<string> {
  const file = await open(path, 'r')
  try {
    const limit = 64 * 1024
    const buffer = Buffer.alloc(limit + 1)
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, Math.min(bytesRead, limit)).toString('utf8') + (bytesRead > limit ? '\n…（输出已截断）' : '')
  } finally { await file.close() }
}
