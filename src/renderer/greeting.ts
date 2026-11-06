/** Local UI copy only. Never sent to the SDK, model, or analytics. */
type Period = 'morning' | 'noon' | 'afternoon' | 'evening'
type Copy = { id: string; group: string; text: string; period?: Period; named?: (name: string) => string; weight?: number }
const generic = (id: string, text: string, named?: Copy['named'], weight = 1): Copy => ({ id, group: id, text, named, weight })
const timed = (period: Period, group: string, text: string, named?: Copy['named']): Copy => ({ id: `${period}-${group}`, group, text, period, named })
export const GREETINGS: Copy[] = [
  generic('tinker', '今天想捣鼓点什么？', n => `${n}，今天想捣鼓点什么？`),
  generic('brick', '先从哪块砖搭起？', n => `${n}，先从哪块砖搭起？`),
  generic('pot', '有什么点子要下锅？'),
  generic('brew', '想酿点什么新东西？'),
  generic('dig', '想往哪儿钻一钻？'),
  generic('thread', '有什么线头要理一理？'),
  generic('raw', '半生不熟的点子也行。', undefined, 0.4),
  generic('knead', '先揉个点子出来？', undefined, 0.4),
  generic('poke', '戳一下，我就开工。', undefined, 0.4),
  generic('sleeves', '袖子挽好了，来吧。', undefined, 0.4),
  timed('morning', 'hello', '早上好', n => `早上好，${n}`),
  timed('morning', 'pot', '早安，先热热锅？'),
  timed('morning', 'tinker', '早上好，今天捣鼓点啥？'),
  timed('noon', 'hello', '中午好', n => `中午好，${n}`),
  timed('noon', 'tinker', '中午好，边吃边捣鼓？'),
  timed('afternoon', 'hello', '下午好', n => `下午好，${n}`),
  timed('afternoon', 'fire', '下午好，再添把柴？'),
  timed('afternoon', 'brick', '下午好，接着搭哪块？'),
  timed('evening', 'hello', '晚上好', n => `晚上好，${n}`),
  timed('evening', 'bake', '晚上好，再烤一炉？'),
  timed('evening', 'stew', '晚上好，慢火炖点什么？')
]
export interface GreetingHistory { day: string; recent: string[]; named: boolean }
export const EMPTY_HISTORY: GreetingHistory = { day: '', recent: [], named: false }
export const FALLBACK_GREETING = '今天想做点什么？'
export const HISTORY_KEY = 'claude-desk.greeting.v1'
export function periodAt(hour: number): Period | undefined {
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 13) return 'noon'
  if (hour >= 13 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 24) return 'evening'
}
/** Conservative display filter; a login identifier is not a verified real name. */
export function displayName(value?: string | null): string | null {
  const name = value?.trim()
  if (!name || name === '本机用户' || [...name].length > 20 || /[@/\\\p{Cc}\p{Cf}]/u.test(name)) return null
  if (!/\p{L}/u.test(name) || /\d{5}/.test(name) || /^[a-f\d]{12,}$/i.test(name)) return null
  return name
}
export function greetingName(profile?: string | null, email?: string | null, username?: string | null): string | null {
  return displayName(profile) ?? displayName(email?.split('@')[0]) ?? displayName(username)
}
export function selectGreeting(history: GreetingHistory, now: Date, name: string | null, random = Math.random) {
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  const first = day !== history.day
  const period = periodAt(now.getHours())
  const available = GREETINGS.filter(c => !history.recent.includes(c.group))
  const timedPool = available.filter(c => c.period === period && !!period)
  const generalPool = available.filter(c => !c.period)
  const pool = period && (first || random() < 0.3) && timedPool.length ? timedPool : generalPool
  const total = pool.reduce((sum, c) => sum + (c.weight ?? 1), 0)
  let draw = random() * total
  const copy = pool.find(c => (draw -= c.weight ?? 1) < 0) ?? pool[0]!
  const safeName = displayName(name)
  const named = !!(safeName && copy.named && !history.named && (first || random() < 0.25))
  return {
    text: named ? copy.named!(safeName!) : copy.text,
    history: { day, recent: [...history.recent, copy.group].slice(-5), named },
    id: copy.id, group: copy.group
  }
}
let memory: GreetingHistory = EMPTY_HISTORY
let memoryOnly = false
export function nextGreeting(name: string | null): string {
  try {
    const raw = memoryOnly ? null : localStorage.getItem(HISTORY_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      const h = parsed as GreetingHistory
      if (!h || typeof h.day !== 'string' || typeof h.named !== 'boolean' || !Array.isArray(h.recent) || h.recent.length > 5 || h.recent.some(x => typeof x !== 'string')) throw new Error('Invalid greeting history')
      memory = h
    }
  } catch {
    memory = EMPTY_HISTORY
    // No account data is stored here. Repair corrupt history for the next entry.
    try { localStorage.removeItem(HISTORY_KEY) } catch { /* unavailable storage */ }
    return FALLBACK_GREETING
  }
  const selected = selectGreeting(memory, new Date(), name)
  memory = selected.history
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(memory)) } catch { memoryOnly = true /* keep in-memory deduplication */ }
  return selected.text
}
