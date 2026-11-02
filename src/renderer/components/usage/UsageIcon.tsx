import input from '../../assets/usage/input.svg'
import output from '../../assets/usage/output.svg'
import total from '../../assets/usage/total.svg'
import cacheRead from '../../assets/usage/cache-read.svg'
import cacheHit from '../../assets/usage/cache-hit.svg'
import cacheWrite from '../../assets/usage/cache-write.svg'

const icons = { input, output, total, cacheHit, cacheRead, cacheWrite }
/** Traced from the supplied artwork. Masking preserves the silhouette in both themes. */
export function UsageIcon({ kind, size = 26 }: { kind: keyof typeof icons; size?: number }) {
  const mask = `url("${icons[kind]}") center / contain no-repeat`
  return <span aria-hidden="true" data-usage-icon={kind} className="inline-block shrink-0 bg-current align-middle" style={{ width: size, height: size, mask, WebkitMask: mask }} />
}
