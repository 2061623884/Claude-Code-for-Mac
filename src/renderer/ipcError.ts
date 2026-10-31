/** IPC 调用失败时的说明文字：去掉 Electron 加在前面的「Error invoking remote method …」 */
export function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
