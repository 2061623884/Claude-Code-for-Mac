import { useEffect, useReducer } from 'react'
import { cacheMinutesLeft } from '@shared/cacheWindow'

/** 缓存剩余分钟数，每跨过一个整分钟刷新一次；没有缓存时为 null */
export function useCacheMinutes(expiresAt?: number): number | null {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  const left = expiresAt === undefined ? null : expiresAt - Date.now()
  useEffect(() => {
    if (left === null || left <= 0) return
    const id = setTimeout(tick, (left % 60_000) + 1)
    return () => clearTimeout(id)
  })
  return expiresAt === undefined ? null : cacheMinutesLeft(expiresAt, Date.now())
}
