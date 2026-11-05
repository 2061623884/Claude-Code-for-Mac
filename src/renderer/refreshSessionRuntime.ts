/** A historical conversation has no process until controls are prepared. */
export async function refreshSessionRuntime(sessionId: string, cwd?: string): Promise<void> {
  if (!cwd) throw new Error('无法确定对话所在项目，请重新打开对话')
  await window.desk.chat.prepareControls(sessionId, cwd)
  await window.desk.chat.refreshRuntime(sessionId)
}
