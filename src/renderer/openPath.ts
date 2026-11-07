import { useLayout } from './layoutStore'

/** File navigation is shared by presentation components without importing either component. */
export function openPath(path: string, kind: 'file' | 'dir', line?: number, external = false): void {
  if (kind === 'dir') void window.desk.projects.revealInFinder(path)
  else if (external) void window.desk.files.open(path).catch(() => {})
  else useLayout.getState().openFile(path, line)
}
