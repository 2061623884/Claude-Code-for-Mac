/** Keep failures visible, with raw diagnostics available on demand. */
export function ChatError({ error }: { error: string }) {
  // Older live sessions may still carry the previous stop error format.
  if (/^已按用户请求停止(?:\s|$)/.test(error)) return null
  const detailed = error.includes('\n') || /\[ede_diagnostic\]|^运行结束：/.test(error) || error.length > 120
  if (!detailed) return <div role="alert" className="my-3 text-[13px] text-danger select-text">{error}</div>
  return <details className="my-3 text-[13px] text-danger">
    <summary className="cursor-pointer" aria-label="执行未完成，展开详情">执行未完成</summary>
    <div className="mt-2 whitespace-pre-wrap break-words text-fg2 select-text">{error}</div>
  </details>
}
