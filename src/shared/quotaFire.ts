/** Sidebar quota label: the 5-hour window is the fire in the stove, the weekly window is the woodpile. Inputs are remaining percents. */
export const QUOTA_LOW = 20
export type QuotaFireInput = { failed?: boolean; available?: boolean; fiveHour?: number | null; weekly?: number | null }
export function quotaFireLabel({ failed, available, fiveHour, weekly }: QuotaFireInput): string {
  if (available === undefined) return failed ? '火光不明' : '生火中…'
  const five = fiveHour ?? null, week = weekly ?? null
  if (!available || (five === null && week === null)) return '剩余额度'
  if (week !== null && week <= 0) return '柴已烧尽'
  if (five !== null && five <= 0) return '灶火暂歇'
  const fireLow = five !== null && five <= QUOTA_LOW
  const pileLow = week !== null && week <= QUOTA_LOW
  return fireLow ? (pileLow ? '柴火告急' : '快烧完了') : pileLow ? '余柴不多' : '柴火正旺'
}
