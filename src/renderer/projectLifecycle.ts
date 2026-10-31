// 项目列表项移除后的同步通知。各资源所有者负责自己的解绑与释放。
const listeners = new Set<(projectId: string) => void>()
export function onProjectRemoved(listener: (projectId: string) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function projectRemoved(projectId: string): void {
  for (const listener of listeners) listener(projectId)
}
