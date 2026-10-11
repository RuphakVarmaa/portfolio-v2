import { useEffect, useRef, useState } from 'react'
import { createRng, fmt, wobblePoints, type Pt } from '../../lib/draw/wobble.ts'
import { roundedRect } from '../../lib/draw/paths.ts'
import { getGsap, isLite, loadGsap } from '../../lib/draw/motion.ts'
import { cx } from './cx.ts'
import { Readout } from './Readout.tsx'
import styles from './ui.module.css'

export interface MeterProps {
  /** What the meter measures, e.g. `inference p95 (ms)`. Also its accessible name. */
  label: string
  value: number
  min: number
  max: number
  unit?: string
  /** Draw a hatched warning zone from this value to `max` (e.g. the SLO limit). */
  warn?: number
  /** Digits after the decimal point in the readout. Default 0. */
  decimals?: number
  /** Set the needle without the overshoot tween (also automatic under lite motion). */
  instant?: boolean
  className?: string
}

/** sin and cos of -60 deg .. +60 deg in 12 degree steps, as constants (no trigonometry at runtime; see wobble.ts). */
const TABLE: ReadonlyArray<readonly [number, number]> = [
  [-0.8660254037844386, 0.5000000000000001],
  [-0.7431448254773942, 0.6691306063588582],
  [-0.5877852522924731, 0.8090169943749475],
  [-0.4067366430758002, 0.9135454576426009],
  [-0.20791169081775934, 0.9781476007338057],
  [0, 1],
  [0.20791169081775934, 0.9781476007338057],
  [0.4067366430758002, 0.9135454576426009],
  [0.5877852522924731, 0.8090169943749475],
  [0.7431448254773942, 0.6691306063588582],
  [0.8660254037844386, 0.5000000000000001],
]

const CX = 100
const CY = 114
const RADIUS = 84
const NEEDLE = 74
const SWEEP = 60

/** Unit vector (sin, cos) at fraction t of the sweep, interpolated between table rows and renormalised. */
function unitAt(t: number): readonly [number, number] {
  const scaled = Math.max(0, Math.min(1, t)) * 10
  const i = Math.min(9, Math.floor(scaled))
  const f = scaled - i
  const x = TABLE[i][0] + (TABLE[i + 1][0] - TABLE[i][0]) * f
  const y = TABLE[i][1] + (TABLE[i + 1][1] - TABLE[i][1]) * f
  const length = Math.sqrt(x * x + y * y)
  return [x / length, y / length]
}

const point = (t: number, radius: number): Pt => {
  const [s, c] = unitAt(t)
  return [CX + s * radius, CY - c * radius]
}

const arc = (t0: number, t1: number, radius: number): string => {
  const a = point(t0, radius)
  const b = point(t1, radius)
  return `M${fmt(a[0])} ${fmt(a[1])}A${radius} ${radius} 0 0 1 ${fmt(b[0])} ${fmt(b[1])}`
}

const fraction = (value: number, min: number, max: number) =>
  max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)))

const angleOf = (t: number) => -SWEEP + 2 * SWEEP * t

/**
 * An analog panel meter, drawn by hand: wobbled frame, tick marks, a hatched warning zone, and a
 * vermilion needle that throws with a little overshoot (core GSAP, instant under lite motion).
 * The readout under the dial is the real value; the needle is only a picture of it.
 */
export function Meter({ label, value, min, max, unit, warn, decimals = 0, instant, className }: MeterProps) {
  const needle = useRef<SVGGElement>(null)
  const degrees = angleOf(fraction(value, min, max))
  // React renders the needle once at its first angle; every later change is applied imperatively below,
  // so React and the tween never fight over the same attribute.
  const [firstDegrees] = useState(degrees)

  useEffect(() => {
    const el = needle.current
    if (!el) return
    const set = () => el.setAttribute('transform', `rotate(${fmt(degrees)} ${CX} ${CY})`)
    if (instant || isLite()) {
      set()
      return
    }
    const kit = getGsap()
    let cancelled = false
    const run = (loaded: NonNullable<typeof kit>) => {
      if (cancelled) return
      loaded.gsap.to(el, { rotation: degrees, svgOrigin: `${CX} ${CY}`, duration: 0.5, ease: 'back.out(1.6)', overwrite: true })
    }
    if (kit) run(kit)
    else {
      set()
      loadGsap().then(run, () => undefined)
    }
    return () => {
      cancelled = true
    }
  }, [degrees, instant])

  const rng = createRng(`meter:${label}`)
  const ticks: Array<{ d: string; major: boolean }> = []
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    const outer = point(t, RADIUS)
    const inner = point(t, RADIUS - 11)
    ticks.push({ d: `M${fmt(inner[0])} ${fmt(inner[1])}L${fmt(outer[0])} ${fmt(outer[1])}`, major: true })
    if (i < 10) {
      const mid = (i + 0.5) / 10
      const a = point(mid, RADIUS)
      const b = point(mid, RADIUS - 6)
      ticks.push({ d: `M${fmt(b[0])} ${fmt(b[1])}L${fmt(a[0])} ${fmt(a[1])}`, major: false })
    }
  }
  const frame = roundedRect(3, 3, 194, 128, 8, `meter:frame:${label}`, 0.7)
  const warnFrom = warn !== undefined && warn > min && warn < max ? fraction(warn, min, max) : null
  const hatch: string[] = []
  if (warnFrom !== null) {
    const steps = Math.max(3, Math.round((1 - warnFrom) * 12))
    for (let i = 0; i <= steps; i++) {
      const t = warnFrom + ((1 - warnFrom) * i) / steps
      const a = point(t, RADIUS - 3)
      const b = point(t, RADIUS - 12)
      const jitter = (rng() - 0.5) * 0.8
      hatch.push(`M${fmt(a[0] + jitter)} ${fmt(a[1])}L${fmt(b[0])} ${fmt(b[1] + jitter)}`)
    }
  }
  const [pivotWobble] = wobblePoints([[CX, CY]], `meter:pivot:${label}`, 0.4)
  const shown = value.toFixed(decimals)

  return (
    <div
      className={cx(styles.meter, className)}
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${shown}${unit ? ` ${unit}` : ''}${warn !== undefined && value >= warn ? ', over the limit' : ''}`}
    >
      <div className={styles.meterFace}>
        <svg className={styles.meterDial} viewBox="0 0 200 134" aria-hidden="true">
          <path className={styles.meterFrame} d={frame} />
          <path className={styles.meterScale} d={arc(0, 1, RADIUS)} />
          {warnFrom !== null ? <path className={styles.meterWarnArc} d={arc(warnFrom, 1, RADIUS - 2)} /> : null}
          {hatch.map((d, i) => (
            <path key={i} className={styles.meterHatch} d={d} />
          ))}
          {ticks.map((tick, i) => (
            <path key={i} className={tick.major ? styles.meterTickMajor : styles.meterTick} d={tick.d} />
          ))}
          <g ref={needle} transform={`rotate(${fmt(firstDegrees)} ${CX} ${CY})`}>
            <path className={styles.meterNeedle} d={`M${CX} ${CY}L${CX} ${CY - NEEDLE}`} />
          </g>
          <circle className={styles.meterHub} cx={fmt(pivotWobble[0])} cy={fmt(pivotWobble[1])} r="6" />
        </svg>
        {/* The ends of the scale, set under the ends of the arc (HTML, so they stay 12 px whatever width the dial is drawn at). */}
        <span className={styles.meterEnd} data-end="min" aria-hidden="true">
          {min}
        </span>
        <span className={styles.meterEnd} data-end="max" aria-hidden="true">
          {max}
        </span>
      </div>
      <div className={styles.meterFoot}>
        <span className="stencil">{label}</span>
        <span className={styles.meterReading}>
          <Readout value={shown} width={Math.max(2, shown.length)} size="md" align="start" face="mono" />
          {unit ? <span className={styles.meterUnit}>{unit}</span> : null}
        </span>
      </div>
    </div>
  )
}
