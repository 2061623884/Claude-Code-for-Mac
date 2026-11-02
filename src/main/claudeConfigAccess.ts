// CLI 配置包含用户级文件。跨项目串行化完整快照和写入，避免读到半次保存。
let pending: Promise<unknown> = Promise.resolve()

export function withClaudeConfig<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation)
  pending = result.catch(() => {})
  return result
}
