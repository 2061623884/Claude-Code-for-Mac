import { create } from 'zustand'
import type { DemoState, DetectedFolder, EffortLevel, MetaInfo, PermissionMode, Project, SessionSummary, Settings } from '@shared/types'

export type View = { kind: 'new' } | { kind: 'session'; sessionId: string; projectId: string } | { kind: 'settings' }

interface DeskState {
  ready: boolean
  home: string
  demo: DemoState | null
  projects: Project[]
  sessions: Record<string, SessionSummary[]>
  settings: Settings | null
  meta: MetaInfo | null
  metaError: string | null
  view: View
  selectedProjectId: string | null
  draftModel: string | null
  draftMode: PermissionMode
  draftEffort: EffortLevel | null
  sidebarCollapsed: boolean
  /** 待确认添加的项目路径（选择器选完后弹确认框） */
  pendingProjectPath: string | null
  importCandidates: DetectedFolder[] | null
  searchOpen: boolean

  init(): Promise<void>
  refreshSessions(projectId?: string): Promise<void>
  setView(view: View): void
  newChat(projectId?: string): void
  pickProject(): Promise<void>
  confirmAddProject(): Promise<void>
  cancelAddProject(): void
  removeProject(id: string): Promise<void>
  toggleProject(id: string): Promise<void>
  importProjects(paths: string[]): Promise<void>
  renameSession(session: SessionSummary, projectId: string, title: string): Promise<void>
  setArchived(session: SessionSummary, projectId: string, archived: boolean): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  setDraft(patch: { model?: string | null; mode?: PermissionMode; effort?: EffortLevel | null; projectId?: string }): void
  toggleSidebar(): void
  setSearchOpen(open: boolean): void
  /** 新会话刚开始时先在侧栏放一条，等会话文件写出后刷新成真实标题 */
  addPendingSession(projectId: string, sessionId: string, firstPrompt: string): void
}

const desk = (): Window['desk'] => window.desk

export const useDesk = create<DeskState>((set, get) => ({
  ready: false,
  home: '',
  demo: null,
  projects: [],
  sessions: {},
  settings: null,
  meta: null,
  metaError: null,
  view: { kind: 'new' },
  selectedProjectId: null,
  draftModel: null,
  draftMode: 'default',
  draftEffort: null,
  sidebarCollapsed: false,
  searchOpen: false,
  pendingProjectPath: null,
  importCandidates: null,

  async init() {
    const [state, projects, settings] = await Promise.all([desk().app.state(), desk().projects.list(), desk().settings.get()])
    const demo = state.demo
    set({
      ready: true,
      home: state.home,
      demo,
      projects,
      settings,
      selectedProjectId: projects[0]?.id ?? null,
      draftModel: settings.defaultModel,
      draftMode: settings.defaultPermissionMode,
      draftEffort: settings.defaultEffort,
      view: demo?.route === 'settings' ? { kind: 'settings' } : { kind: 'new' },
      pendingProjectPath: demo?.dialog === 'add-project' ? (demo.dialogPath ?? state.home) : null
    })
    desk()
      .meta.get()
      .then((meta) => set({ meta }))
      .catch((err: Error) => set({ metaError: err.message }))
    await get().refreshSessions()

    if (demo?.dialog === 'import' || (!state.seededFromHistory && projects.length === 0)) {
      const candidates = await desk().projects.detectFromHistory()
      if (candidates.length > 0) set({ importCandidates: candidates })
      else await desk().projects.markSeeded()
    }
  },

  async refreshSessions(projectId) {
    const targets = get().projects.filter((p) => !projectId || p.id === projectId)
    const entries = await Promise.all(targets.map(async (p) => [p.id, await desk().sessions.list(p.path)] as const))
    set({ sessions: { ...get().sessions, ...Object.fromEntries(entries) } })
  },

  setView(view) {
    set({ view })
  },

  newChat(projectId) {
    set({ view: { kind: 'new' }, selectedProjectId: projectId ?? get().selectedProjectId ?? get().projects[0]?.id ?? null })
  },

  async pickProject() {
    const path = await desk().projects.pickFolder()
    if (path) set({ pendingProjectPath: path })
  },

  async confirmAddProject() {
    const path = get().pendingProjectPath
    if (!path) return
    const projects = await desk().projects.add(path)
    const added = projects.find((p) => p.path === path)
    set({ projects, pendingProjectPath: null, selectedProjectId: added?.id ?? get().selectedProjectId })
    if (added) await get().refreshSessions(added.id)
  },

  cancelAddProject() {
    set({ pendingProjectPath: null })
  },

  async removeProject(id) {
    const projects = await desk().projects.remove(id)
    const sessions = { ...get().sessions }
    delete sessions[id]
    const selectedProjectId = get().selectedProjectId === id ? (projects[0]?.id ?? null) : get().selectedProjectId
    const view = get().view
    set({ projects, sessions, selectedProjectId, view: view.kind === 'session' && view.projectId === id ? { kind: 'new' } : view })
  },

  async toggleProject(id) {
    const p = get().projects.find((x) => x.id === id)
    if (p) set({ projects: await desk().projects.setCollapsed(id, !p.collapsed) })
  },

  async importProjects(paths) {
    let projects = get().projects
    for (const path of paths) projects = await desk().projects.add(path)
    await desk().projects.markSeeded()
    set({ projects, importCandidates: null, selectedProjectId: get().selectedProjectId ?? projects[0]?.id ?? null })
    await get().refreshSessions()
  },

  async renameSession(session, projectId, title) {
    const project = get().projects.find((p) => p.id === projectId)
    if (!project || !title.trim() || title === session.title) return
    await desk().sessions.rename(session.id, title.trim(), project.path)
    await get().refreshSessions(projectId)
  },

  async setArchived(session, projectId, archived) {
    await desk().sessions.setArchived(session.id, archived)
    await get().refreshSessions(projectId)
  },

  async updateSettings(patch) {
    set({ settings: await desk().settings.set(patch) })
  },

  setDraft({ model, mode, effort, projectId }) {
    set({
      ...(model !== undefined && { draftModel: model }),
      ...(mode !== undefined && { draftMode: mode }),
      ...(effort !== undefined && { draftEffort: effort }),
      ...(projectId !== undefined && { selectedProjectId: projectId })
    })
  },

  toggleSidebar() {
    set({ sidebarCollapsed: !get().sidebarCollapsed })
  },

  setSearchOpen(open) {
    set({ searchOpen: open })
  },

  addPendingSession(projectId, sessionId, firstPrompt) {
    const list = get().sessions[projectId] ?? []
    if (list.some((s) => s.id === sessionId)) return
    const project = get().projects.find((p) => p.id === projectId)
    const entry = { id: sessionId, title: firstPrompt.replace(/\s+/g, ' ').trim().slice(0, 80), cwd: project?.path ?? '', lastModified: Date.now(), archived: false }
    set({ sessions: { ...get().sessions, [projectId]: [entry, ...list] } })
  }
}))
