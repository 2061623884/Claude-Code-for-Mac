import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename } from 'node:path'
import { BrowserWindow, dialog, shell } from 'electron'
import type { DetectedFolder, Project } from '../shared/types'
import { detectFolders } from '../shared/format'
import { loadSdk } from './sdk'
import * as store from './store'

export function list(): Project[] {
  return store.read().projects
}

/** 只负责弹出选择器并返回路径；是否添加由界面上的确认框决定 */
export async function pickFolder(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: '选择项目文件夹',
    buttonLabel: '选择',
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

export function add(path: string): Project[] {
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`文件夹不存在：${path}`)
  if (list().some((p) => p.path === path)) return list()
  return store.update((d) => {
    d.projects.push({ id: randomUUID(), path, name: basename(path) || path, addedAt: Date.now(), collapsed: false })
  }).projects
}

export function remove(id: string): Project[] {
  return store.update((d) => {
    d.projects = d.projects.filter((p) => p.id !== id)
  }).projects
}

export function setCollapsed(id: string, collapsed: boolean): Project[] {
  return store.update((d) => {
    const p = d.projects.find((x) => x.id === id)
    if (p) p.collapsed = collapsed
  }).projects
}

export async function detectFromHistory(): Promise<DetectedFolder[]> {
  const sdk = await loadSdk()
  const sessions = await sdk.listSessions()
  const known = new Set(list().map((p) => p.path))
  return detectFolders(sessions, homedir(), existsSync).filter((f) => !known.has(f.path))
}

export function markSeeded(): void {
  store.update((d) => {
    d.seededFromHistory = true
  })
}

export function revealInFinder(path: string): void {
  shell.showItemInFolder(path)
}
