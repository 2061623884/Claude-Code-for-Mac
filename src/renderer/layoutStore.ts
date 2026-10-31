// 三栏布局：左右栏宽度、右栏开关和当前标签。宽度和开关记在本机（localStorage），重启后保持
import { create } from 'zustand'

/** 右栏标签：顺便问一下、项目文件，以及打开的文件（file:<绝对路径>） */
export type RightTab = 'btw' | 'project' | `file:${string}` | `page:${string}`

export interface SidePage {
  id: `page:${string}`
  kind: 'start' | 'files' | 'terminal' | 'browser'
  cwd?: string
}

export interface OpenFile {
  path: string
  line?: number
  /** 每次打开递增，让预览重新滚到指定行 */
  nonce: number
}

const MAX_FILES = 6

export const LEFT = { min: 220, max: 420, default: 272 }
export const RIGHT = { min: 320, max: 600, default: 380 }

interface Saved {
  leftWidth: number
  rightWidth: number
  rightOpen: boolean
  rightTab: RightTab
}

const KEY = 'claude-desk.layout'
const clamp = (n: number, r: { min: number; max: number }): number => Math.round(Math.min(Math.max(n, r.min), r.max))

function load(): Saved {
  const fallback: Saved = { leftWidth: LEFT.default, rightWidth: RIGHT.default, rightOpen: false, rightTab: 'page:home' }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>
    return {
      leftWidth: clamp(Number(saved.leftWidth) || LEFT.default, LEFT),
      rightWidth: clamp(Number(saved.rightWidth) || RIGHT.default, RIGHT),
      rightOpen: saved.rightOpen === true,
      // 打开的文件不保存，重启后回到固定标签
      rightTab: saved.rightTab === 'project' || (saved.rightTab as string) === 'files' ? 'project' : saved.rightTab === 'btw' ? 'btw' : 'page:home'
    }
  } catch {
    return fallback
  }
}

interface LayoutStore extends Saved {
  /** 正在拖动调宽：期间关掉宽度动画，保证跟手 */
  resizing: boolean
  /** 右栏里打开的文件标签，按打开顺序 */
  openFiles: OpenFile[]
  pages: SidePage[]
  expanded: boolean
  setExpanded(expanded: boolean): void
  newPage(cwd?: string, kind?: SidePage['kind']): void
  changePage(id: SidePage['id'], kind: SidePage['kind'], cwd?: string): void
  closePage(id: SidePage['id']): void
  openFile(path: string, line?: number): void
  closeFile(path: string): void
  setLeftWidth(width: number): void
  setRightWidth(width: number): void
  setRightOpen(open: boolean): void
  openRight(tab: RightTab): void
  setResizing(resizing: boolean): void
}

export const useLayout = create<LayoutStore>((set, get) => {
  const save = (patch: Partial<Saved>): void => {
    set(patch)
    const { leftWidth, rightWidth, rightOpen, rightTab } = get()
    try {
      localStorage.setItem(KEY, JSON.stringify({ leftWidth, rightWidth, rightOpen, rightTab }))
    } catch {
      // 存不了就只在本次运行中生效
    }
  }
  return {
    ...load(),
    resizing: false,
    openFiles: [],
    pages: [{ id: 'page:home', kind: 'start' }],
    expanded: false,
    setExpanded: (expanded) => set({ expanded }),
    newPage: (cwd, kind = 'start') => {
      const id = `page:${crypto.randomUUID()}` as const
      set({ pages: [...get().pages, { id, kind, cwd }] })
      save({ rightOpen: true, rightTab: id })
    },
    changePage: (id, kind, cwd) => {
      set({ pages: get().pages.map((p) => p.id === id ? { ...p, kind, cwd: cwd ?? p.cwd } : p) })
    },
    closePage: (id) => {
      const before = get().pages
      const index = before.findIndex((p) => p.id === id)
      if (index < 0) return
      // 标签拥有资源生命周期；隐藏或卸载展示组件时保留主进程中的资源。
      void window.desk.workspace.closePage(id).catch((error) => console.error('关闭工作区页面失败', error))
      const pages = before.filter((p) => p.id !== id)
      if (!pages.length) pages.push({ id: `page:${crypto.randomUUID()}`, kind: 'start' })
      set({ pages })
      if (get().rightTab === id) save({ rightTab: pages[Math.min(Math.max(index, 0), pages.length - 1)].id })
    },
    openFile: (path, line) => {
      const rest = get().openFiles.filter((f) => f.path !== path)
      const existing = get().openFiles.find((f) => f.path === path)
      const entry = { path, line, nonce: (existing?.nonce ?? 0) + 1 }
      // 已经打开的留在原位，新的排到最后；超过上限时关掉最早打开的
      const list = existing ? get().openFiles.map((f) => (f.path === path ? entry : f)) : [...rest, entry].slice(-MAX_FILES)
      set({ openFiles: list })
      save({ rightOpen: true, rightTab: `file:${path}` })
    },
    closeFile: (path) => {
      const list = get().openFiles
      const i = list.findIndex((f) => f.path === path)
      const next = list.filter((f) => f.path !== path)
      set({ openFiles: next })
      if (get().rightTab === `file:${path}`) {
        const neighbour = next[Math.min(i, next.length - 1)]
        save({ rightTab: neighbour ? `file:${neighbour.path}` : 'project' })
      }
    },
    setLeftWidth: (width) => save({ leftWidth: clamp(width, LEFT) }),
    setRightWidth: (width) => save({ rightWidth: clamp(width, RIGHT) }),
    setRightOpen: (rightOpen) => save({ rightOpen }),
    openRight: (rightTab) => save({ rightOpen: true, rightTab }),
    setResizing: (resizing) => set({ resizing })
  }
})
