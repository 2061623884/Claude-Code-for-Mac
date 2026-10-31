import type { BrowserState, ViewBounds } from './workspace'
import type { BtwTurn, ChatEvent, ChatSnapshot, ContextUsage, Decision, McpStatus, SessionOptions } from './chat'

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions'
export type Theme = 'system' | 'light' | 'dark'
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface Project {
  id: string
  path: string
  name: string
  addedAt: number
  collapsed: boolean
}

export interface SessionSummary {
  id: string
  title: string
  cwd: string
  lastModified: number
  archived: boolean
}

export interface DetectedFolder {
  path: string
  sessionCount: number
}

export interface ModelOption {
  value: string
  label: string
  /** 该模型支持的思考程度，空数组表示不支持调节 */
  efforts: EffortLevel[]
}

export interface Settings {
  theme: Theme
  defaultModel: string
  defaultPermissionMode: PermissionMode
  /** null 表示使用模型默认的思考程度 */
  defaultEffort: EffortLevel
  claudePath: string | null
  allowBypass: boolean
}

export interface CommandInfo {
  name: string
  description: string
  argumentHint: string
}

/** 右栏文件预览的内容 */
export type FilePreview =
  | { kind: 'text'; size: number; content: string }
  | { kind: 'image'; size: number; dataUrl: string }
  | { kind: 'pdf'; size: number; base64: string }
  | { kind: 'binary' | 'too-large'; size: number }
  | { kind: 'missing' | 'dir' }

export interface FileInfo {
  path: string
  name: string
  extension: string
  bytes: number
}

export interface ProjectEntry {
  path: string
  name: string
  kind: 'file' | 'dir'
}

export interface MetaInfo {
  models: ModelOption[]
  subscriptionType: string | null
  claudeVersion: string | null
}

/** 套餐用量的一个限额窗口（如 5 小时内、本周） */
export interface UsageWindow {
  label: string
  /** 已用百分比，0–100 */
  percent: number
  resetsAt: string | null
}

export interface PlanUsage {
  subscriptionType: string | null
  /** false：不受套餐限额约束（如使用 API Key） */
  available: boolean
  windows: UsageWindow[]
}

/** 开发截图用：指定启动时的界面状态 */
export interface DemoState {
  route?: 'new' | 'settings'
  dialog?: 'add-project' | 'import'
  dialogPath?: string
  openMenu?: 'project' | 'model' | 'effort' | 'permission' | 'project-picker'
  /** 打开第一个项目里的第 N 个会话 */
  openSession?: number
  /** 启动后自动用这个模型发送这条消息 */
  prompt?: string
  model?: string
}

export interface AppState {
  seededFromHistory: boolean
  demo: DemoState | null
  home: string
}

export interface DeskApi {
  workspace: {
    /** 明确关闭页面时销毁资源；组件卸载不等于关闭页面。 */
    closePage(id: string): Promise<void>
    onShortcut(listener: (kind: 'files' | 'terminal' | 'browser') => void): () => void
  }
  terminal: {
    open(id: string, cwd: string): Promise<{ output: string; exited: boolean }>
    write(id: string, data: string): Promise<void>
    resize(id: string, cols: number, rows: number): Promise<void>
    close(id: string): Promise<void>
    onData(listener: (id: string, data: string) => void): () => void
    onExit(listener: (id: string, code: number) => void): () => void
  }
  browser: {
    open(id: string): Promise<BrowserState>
    navigate(id: string, url: string): Promise<void>
    bounds(id: string, bounds: ViewBounds | null): Promise<void>
    action(id: string, action: 'back' | 'forward' | 'reload' | 'stop'): Promise<void>
    close(id: string): Promise<void>
    onState(listener: (id: string, state: BrowserState) => void): () => void
  }
  app: {
    state(): Promise<AppState>
    /** 把窗口带到最前面（点系统通知时） */
    focus(): Promise<void>
  }
  projects: {
    list(): Promise<Project[]>
    pickFolder(): Promise<string | null>
    add(path: string): Promise<Project[]>
    remove(id: string): Promise<Project[]>
    setCollapsed(id: string, collapsed: boolean): Promise<Project[]>
    detectFromHistory(): Promise<DetectedFolder[]>
    markSeeded(): Promise<void>
    revealInFinder(path: string): Promise<void>
  }
  sessions: {
    list(projectPath: string): Promise<SessionSummary[]>
    rename(id: string, title: string, projectPath: string): Promise<void>
    setArchived(id: string, archived: boolean): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
  }
  meta: {
    get(): Promise<MetaInfo>
    commands(projectPath: string): Promise<CommandInfo[]>
    /** 套餐用量（和终端里 /usage 看到的一样），不消耗额度 */
    usage(): Promise<PlanUsage>
    /** 执行 /config：不带参数返回设置清单，带 key=value 修改一项（临时会话，不写入任何对话） */
    config(projectPath: string, setting?: string): Promise<string>
  }
  files: {
    /** Electron 44 不再在 File 对象上暴露 path，需要通过 webUtils 转换 */
    pathFor(file: File): string
    /** 校验路径并返回普通文件信息；目录、缺失和不可读文件会被过滤 */
    describe(paths: string[]): Promise<FileInfo[]>
    search(projectPath: string, query: string): Promise<string[]>
    /** 读取项目内的一个目录；只接受项目根目录内的路径 */
    list(projectPath: string, directory: string): Promise<ProjectEntry[]>
    /** 在项目内新建空文件或文件夹，返回绝对路径 */
    create(projectPath: string, directory: string, kind: ProjectEntry['kind'], name: string): Promise<string>
    /** 用默认应用打开文件 */
    open(path: string): Promise<void>
    /** 右栏预览：读取文件内容 */
    read(path: string): Promise<FilePreview>
    /** 预览期间监听文件变化（成对调用 unwatch） */
    watch(path: string): Promise<void>
    unwatch(path: string): Promise<void>
    /** 监听中的文件有变化；返回取消订阅函数 */
    onChanged(listener: (path: string) => void): () => void
    /** 批量检查路径是文件、文件夹还是不存在 */
    stat(paths: string[]): Promise<Record<string, 'file' | 'dir' | null>>
  }
  chat: {
    open(sessionId: string, projectPath: string): Promise<ChatSnapshot>
    start(projectPath: string, text: string, options: SessionOptions): Promise<string>
    send(sessionId: string, projectPath: string, text: string, options: SessionOptions): Promise<void>
    /** 编辑历史消息：从源会话 at（主链条目 uuid）之后分叉出新会话并发出 text，返回新会话 id */
    fork(projectPath: string, sourceId: string, at: string, text: string, options: SessionOptions): Promise<string>
    interrupt(sessionId: string): Promise<void>
    setMode(sessionId: string, mode: PermissionMode): Promise<void>
    setModel(sessionId: string, model: string | null): Promise<void>
    setEffort(sessionId: string, effort: EffortLevel | null): Promise<void>
    respond(sessionId: string, requestId: string, decision: Decision): Promise<void>
    /** 会话是否在别处（终端、VS Code）有了新消息 */
    checkExternal(sessionId: string, projectPath: string): Promise<boolean>
    /** 丢掉缓存，从会话文件重新读取 */
    reload(sessionId: string, projectPath: string): Promise<ChatSnapshot>
    /** 当前上下文窗口占用；会话不存在或读取失败时为 null */
    context(sessionId: string, projectPath: string, model: string | null): Promise<ContextUsage | null>
    /** /btw 顺便问一下：返回回答文本，不写入会话 */
    /** /mcp：MCP 服务器状态；sessionId 为 null 时按项目读取 */
    mcp(sessionId: string | null, projectPath: string): Promise<McpStatus[]>
    btw(sessionId: string, projectPath: string, question: string, history: BtwTurn[], options: SessionOptions): Promise<string | null>
    /** 订阅会话事件，返回取消订阅函数 */
    onEvent(listener: (sessionId: string, event: ChatEvent) => void): () => void
  }
}
