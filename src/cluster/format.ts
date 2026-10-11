/** Small pure formatters shared by the shell, the boot line and the records section. */

/** `formatUptime(42_000)` -> `00:42`; `formatUptime(3_723_000)` -> `1:02:03`. */
export function formatUptime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)
  const two = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`
}

/** Decimal units, as in the spec's budgets: 14,239,897 -> `14.24 MB`, 36,524 -> `36.5 KB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`
  return `${(bytes / 1_000_000).toFixed(2)} MB`
}

/** `formatMs(412.4)` -> `412 ms`; under 10 ms keeps one decimal. */
export function formatMs(ms: number): string {
  return ms < 10 ? `${(Math.round(ms * 10) / 10).toString()} ms` : `${Math.round(ms)} ms`
}
