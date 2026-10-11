import { useEffect, useRef, useState, type RefObject } from 'react'
import { useSvgId } from '../../components/ui/ids.ts'
import type { NodeId } from '../../cluster/protocol.ts'
import type { ClusterSpan } from '../../cluster/scheduler.ts'
import { arrowHead, roundedRect } from '../../lib/draw/paths.ts'
import { fmt } from '../../lib/draw/wobble.ts'
import { AXIS_H, BAR_H, GUTTER, LANE_H, PAD_R, layoutSpans, type Bar } from './lane-layout.ts'
import { rewardMs } from './format.ts'
import { labels } from './labels.ts'
import styles from './ChaosLab.module.css'

/**
 * A swimlane trace of what each worker did, drawn from the scheduler's real spans (nothing is made up:
 * every bar is one dispatch attempt with its measured start and end).
 *
 *   solid bar        the attempt finished
 *   solid + bracket  it finished, but only after a retry (the vermilion bracket is the retry flag)
 *   hatched, torn    the worker was cut off mid-job (unplugged or timed out), with a cross
 *   dashed           the attempt failed with an error
 *   open at the end  still running
 *
 * The vermilion dimension line under the lanes is the failover itself: from the moment the failed
 * attempt ended to the moment the retried job finished, with the scheduler's own `recoveredMs`.
 * The SVG is measured and drawn at 1:1 so its type is always a readable 12 px.
 */

export interface SpanLanesProps {
  spans: readonly ClusterSpan[]
  /** Text drawn inside a bar (a batch number, a job id). */
  labelOf?: (span: ClusterSpan) => string
  /** Lane order. Defaults to the nodes that appear in the spans, in pool order. */
  lanes?: readonly NodeId[]
  /** Where an unfinished span ends (`performance.now()`); defaults to the latest time seen. */
  until?: number
  /** The accessible name of the picture. A table of the same spans belongs next to it. */
  label: string
  /** Seeds the pen wobble of the bars. */
  seed: string
}

function useWidth(ref: RefObject<HTMLElement | null>, fallback = 560): number {
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect.width ?? 0)
      if (next > 0) setWidth(next)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return width
}

const TORN = (x: number, y: number, w: number) =>
  `M${fmt(x)} ${fmt(y)}H${fmt(x + w)}L${fmt(x + w - 4)} ${fmt(y + BAR_H * 0.25)}L${fmt(x + w)} ${fmt(y + BAR_H * 0.5)}L${fmt(x + w - 4)} ${fmt(y + BAR_H * 0.75)}L${fmt(x + w)} ${fmt(y + BAR_H)}H${fmt(x)}Z`

function BarShape({ bar, seed, hatch }: { bar: Bar; seed: string; hatch: string }) {
  const { x, y, w, kind, span } = bar
  const key = `${seed}:${span.id}:${span.attempts}`
  switch (kind) {
    case 'killed':
      return <path className={styles.barKilled} fill={`url(#${hatch})`} d={TORN(x, y, w)} />
    case 'error':
      return <path className={styles.barError} d={roundedRect(x, y, w, BAR_H, Math.min(3, w / 2), key, 0.4)} />
    case 'open':
      return <path className={styles.barOpen} d={`M${fmt(x + w)} ${fmt(y)}H${fmt(x)}V${fmt(y + BAR_H)}H${fmt(x + w)}`} />
    default:
      return w < 6 ? (
        <path className={styles.barSliver} d={`M${fmt(x + w / 2)} ${fmt(y)}V${fmt(y + BAR_H)}`} />
      ) : (
        <path className={styles.barOk} d={roundedRect(x, y, w, BAR_H, Math.min(3, w / 2), key, 0.4)} />
      )
  }
}

export function SpanLanes({ spans, labelOf = (span) => span.id, lanes, until, label, seed }: SpanLanesProps) {
  const holder = useRef<HTMLDivElement>(null)
  const width = useWidth(holder)
  const hatch = useSvgId('hatch')
  const layout = layoutSpans(spans, { width, lanes, until })
  const bottom = AXIS_H + layout.lanes.length * LANE_H
  const right = layout.width - PAD_R

  return (
    <div ref={holder} className={styles.lanes}>
      <svg
        className={styles.lanesSvg}
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={label}
      >
        <defs>
          <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path className={styles.hatchLine} d="M0 0V5" />
          </pattern>
        </defs>

        <path className={styles.axis} d={`M${GUTTER} ${AXIS_H - 6}H${fmt(right)}`} />
        {layout.ticks.map((tick, index) => (
          <g key={tick.value}>
            <path className={styles.tick} d={`M${fmt(tick.x)} ${AXIS_H - 10}V${AXIS_H - 2}`} />
            <text className={styles.tickText} x={fmt(tick.x)} y={AXIS_H - 14} textAnchor={index === 0 ? 'start' : 'middle'}>
              {tick.value}
              {index === layout.ticks.length - 1 ? ' ms' : ''}
            </text>
          </g>
        ))}

        {layout.lanes.map((node, lane) => (
          <g key={node}>
            <path className={styles.laneRule} d={`M${GUTTER} ${AXIS_H + (lane + 1) * LANE_H}H${fmt(right)}`} />
            <text className={styles.laneText} x="4" y={AXIS_H + lane * LANE_H + LANE_H / 2 + 4}>
              {node}
            </text>
          </g>
        ))}

        {layout.bars.map((bar) => {
          const text = labelOf(bar.span)
          const filled = bar.kind === 'ok' || bar.kind === 'retry'
          return (
            <g key={`${bar.span.id}:${bar.span.attempts}`}>
              <BarShape bar={bar} seed={seed} hatch={hatch} />
              {bar.kind === 'retry' ? (
                <path className={styles.retryFlag} d={`M${fmt(bar.x + 4)} ${fmt(bar.y - 3)}H${fmt(bar.x - 1.5)}V${fmt(bar.y + BAR_H + 3)}H${fmt(bar.x + 4)}`} />
              ) : null}
              {bar.kind === 'killed' ? (
                <path
                  className={styles.cross}
                  d={(() => {
                    // Inside a wide bar; just past the end of a sliver, so a cut-off is always visible.
                    const cx = bar.w >= 22 ? bar.x + bar.w - 11 : bar.x + bar.w + 9
                    return `M${fmt(cx - 4)} ${fmt(bar.y + 6)}l8 10M${fmt(cx + 4)} ${fmt(bar.y + 6)}l-8 10`
                  })()}
                />
              ) : null}
              {bar.w >= 16 ? (
                <text
                  className={filled ? styles.barText : styles.barTextDark}
                  x={fmt(bar.kind === 'killed' ? bar.x + 8 : bar.x + bar.w / 2)}
                  y={fmt(bar.y + BAR_H / 2 + 4)}
                  textAnchor={bar.kind === 'killed' ? 'start' : 'middle'}
                >
                  {text}
                </text>
              ) : null}
            </g>
          )
        })}

        {layout.dims.map((dim, index) => {
          const y = bottom + 14
          const mid = (dim.x1 + dim.x2) / 2
          const text = `recovered in ${rewardMs(dim.ms)} ms`
          const half = text.length * 3.6
          const labelX = Math.max(GUTTER + half, Math.min(right - half, mid))
          const barBottom = (lane: number) => AXIS_H + lane * LANE_H + (LANE_H + BAR_H) / 2
          return (
            <g key={index}>
              <path className={styles.dimExt} d={`M${fmt(dim.x1)} ${fmt(barBottom(dim.fromLane))}V${y}M${fmt(dim.x2)} ${fmt(barBottom(dim.toLane))}V${y}`} />
              <path className={styles.dim} d={`M${fmt(dim.x1)} ${y}H${fmt(dim.x2)}${arrowHead([dim.x1, y], [-1, 0], 6)}${arrowHead([dim.x2, y], [1, 0], 6)}`} />
              <text className={styles.dimText} x={fmt(labelX)} y={y + 18} textAnchor="middle">
                {text}
              </text>
            </g>
          )
        })}
      </svg>
      {spans.length === 0 ? <p className={styles.lanesEmpty}>{labels.logEmpty}</p> : null}
    </div>
  )
}
