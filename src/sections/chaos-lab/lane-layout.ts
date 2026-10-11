import type { NodeId } from '../../cluster/protocol.ts'
import { allNodeIds } from '../../cluster/registry.ts'
import type { ClusterSpan } from '../../cluster/scheduler.ts'

/**
 * Geometry for the span chart (a swimlane trace of what each worker did, drawn from the scheduler's real
 * spans). Pure: the same spans and width always give the same layout, so it is unit-tested and the
 * component only draws.
 */

export const LANE_H = 36
export const BAR_H = 22
export const AXIS_H = 30
export const GUTTER = 84
export const PAD_R = 14
export const DIM_H = 46

export type BarKind = 'ok' | 'retry' | 'killed' | 'error' | 'open'

export interface Bar {
  span: ClusterSpan
  lane: number
  x: number
  y: number
  w: number
  kind: BarKind
}

export interface Tick {
  x: number
  /** Milliseconds since the first span in view. */
  value: number
}

export interface Dimension {
  /** Where the failed attempt ended. */
  x1: number
  /** Where the retry finished. */
  x2: number
  /** The scheduler's own `recoveredMs`. */
  ms: number
  /** Lane of the failed attempt and of the retry, for the extension lines. */
  fromLane: number
  toLane: number
}

export interface Layout {
  width: number
  height: number
  /** `performance.now()` of the left edge of the plot. */
  t0: number
  /** Milliseconds the plot covers. */
  range: number
  lanes: NodeId[]
  bars: Bar[]
  ticks: Tick[]
  dims: Dimension[]
}

/** 1, 2 or 5 times a power of ten, the smallest that is at least `rough`. */
export function niceStep(rough: number): number {
  if (!(rough > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(rough))
  const f = rough / power
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power
}

export function kindOf(span: ClusterSpan): BarKind {
  if (span.outcome === undefined) return 'open'
  if (span.outcome === 'ok') return span.attempts > 1 ? 'retry' : 'ok'
  if (span.outcome === 'error') return 'error'
  return 'killed' // terminated or timed out: the worker was cut off
}

/** Lanes in pool order, restricted to the nodes that appear in `spans` (or all five when `all`). */
export function lanesFor(spans: readonly ClusterSpan[], all = false): NodeId[] {
  const seen = new Set(spans.map((span) => span.node))
  return allNodeIds().filter((node) => all || seen.has(node))
}

/**
 * Spans that belong to the most recent burst of activity: walk back from the newest span and stop at the
 * first silence longer than `gapMs`. A fuzz is a burst; so is a boot. This is what keeps a 30 ms failover
 * readable after minutes of idle time.
 */
export function lastBurst(spans: readonly ClusterSpan[], gapMs = 1000): ClusterSpan[] {
  if (spans.length === 0) return []
  const ordered = [...spans].sort((a, b) => a.start - b.start)
  let end = ordered[ordered.length - 1].end ?? ordered[ordered.length - 1].start
  let from = ordered.length - 1
  for (let i = ordered.length - 1; i >= 0; i--) {
    const finished = ordered[i].end ?? ordered[i].start
    if (end - finished > gapMs) break
    from = i
    end = Math.min(end, ordered[i].start)
  }
  return ordered.slice(from)
}

export function layoutSpans(
  spans: readonly ClusterSpan[],
  options: { width: number; lanes?: readonly NodeId[]; until?: number },
): Layout {
  const lanes = [...(options.lanes ?? lanesFor(spans))]
  const width = Math.max(240, options.width)
  const t0 = spans.length === 0 ? 0 : Math.min(...spans.map((span) => span.start))
  const latest = spans.length === 0 ? 0 : Math.max(...spans.map((span) => span.end ?? options.until ?? span.start))
  const range = Math.max(latest - t0, 1)
  const plot = Math.max(width - GUTTER - PAD_R, 40)
  const x = (t: number) => GUTTER + ((t - t0) / range) * plot

  const bars: Bar[] = spans.flatMap((span) => {
    const lane = lanes.indexOf(span.node)
    if (lane < 0) return []
    const x1 = x(span.start)
    const x2 = x(span.end ?? options.until ?? latest)
    return [{ span, lane, x: x1, y: AXIS_H + lane * LANE_H + (LANE_H - BAR_H) / 2, w: Math.max(x2 - x1, 3), kind: kindOf(span) }]
  })

  const dims: Dimension[] = []
  for (const bar of bars) {
    const { span } = bar
    if (span.outcome !== 'ok' || span.recoveredMs === undefined || span.end === undefined) continue
    const failed = bars
      .filter((other) => other.span.id === span.id && other.span.attempts < span.attempts && other.span.end !== undefined)
      .sort((a, b) => a.span.attempts - b.span.attempts)[0]
    if (!failed || failed.span.end === undefined) continue
    dims.push({ x1: x(failed.span.end), x2: x(span.end), ms: span.recoveredMs, fromLane: failed.lane, toLane: bar.lane })
  }

  const step = niceStep(range / Math.max(2, Math.floor(plot / 90)))
  const ticks: Tick[] = []
  for (let value = 0; value <= range + 1e-9; value += step) ticks.push({ x: x(t0 + value), value: Math.round(value * 1000) / 1000 })

  return { width, height: AXIS_H + lanes.length * LANE_H + (dims.length > 0 ? DIM_H : 12), t0, range, lanes, bars, ticks, dims }
}
