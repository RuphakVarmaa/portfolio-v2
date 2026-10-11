/**
 * How this panel prints a measured time. `formatMs` (src/cluster/format.ts) keeps one decimal under 10 ms, which
 * turns a real 0.02 ms into `0 ms`: it reads as a hard-coded zero, and it is not one. A time too short for the
 * browser's clock to resolve (it ticks in tenths of a millisecond) is printed as `<0.1 ms` instead.
 *
 * Pure and DOM-free.
 */
import { formatMs } from '../../../cluster/format.ts'

export function fmtMs(ms: number): string {
  return ms < 0.05 ? '<0.1 ms' : formatMs(ms)
}
