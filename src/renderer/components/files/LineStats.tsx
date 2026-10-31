/** 增删行数：+3 −1 */
export function LineStats({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="shrink-0 font-mono text-[11.5px] tabular-nums">
      {added > 0 && <span className="text-[#5f8a3e]">+{added}</span>}
      {added > 0 && removed > 0 && ' '}
      {removed > 0 && <span className="text-danger">−{removed}</span>}
    </span>
  )
}
