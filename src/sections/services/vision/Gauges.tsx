import { useId, useState } from 'react'
import { useTierInfo } from '../../../cluster/store.ts'
import { Meter } from '../../../components/ui/Meter.tsx'
import { PlainCaption } from '../../../components/ui/PlainCaption.tsx'
import { copy, projectFor } from '../../../data/copy.ts'
import { noTimingReason, parseLimit, pickRange, queueHasReading, type NoTimingReason } from '../../../lib/vision/readings.ts'
import { Label } from './Label.tsx'
import { BACKPRESSURE_DEPTH, CAPTURE_HZ, type Pipeline } from './Pipeline.ts'
import { strings } from './strings.ts'
import { useEngine } from './useEngine.ts'
import styles from './Vision.module.css'

/** Dial ranges that grow with the value (never shrink while a session runs), so the readout is exact and the needle is never pinned. */
const P95_RANGES = [60, 120, 250, 500, 1000] as const
const DROPPED_RANGES = [10, 50, 200, 1000] as const

/** What to say under the dials while the first one has no timing (the dial itself shows a dash). */
const NO_TIMING: Record<NoTimingReason, string> = {
  'no-frames': strings.gauges.noData,
  'no-inference': strings.gauges.noInference,
  'recording-without-detector': strings.gauges.noRecordedTiming,
}

/**
 * This device against production: the frame rate this device delivers right now (measured) beside the
 * production figure, which is quoted verbatim from the data and is never dimmed, rewritten or "corrected"
 * by what this device measures. Capture is capped at 15 Hz by design, so the number honestly stays under 30.
 */
function Compare({ engine }: { engine: Pipeline }) {
  const t = copy.services.vision
  const fpsMetric = projectFor('vision').metrics.find((metric) => metric.label === 'sustained FPS')
  const tier = useTierInfo()
  const fps = useEngine(engine, (s) => s.fps)
  // During a replay the numbers are the recorded device's, not this one's: say so instead of "your device".
  const replay = useEngine(engine, (s) => s.phase === 'replay')
  const slowed = useEngine(engine, (s) => s.speed !== 'normal')
  const hz = CAPTURE_HZ[tier.tier] || CAPTURE_HZ.standard
  return (
    <div className={styles.compare}>
      <div>
        <p className="stencil">{replay ? strings.stage.recorded : strings.gauges.thisDevice}</p>
        <p className={styles.compareValue}>{fps === null ? '—' : replay ? strings.gauges.recordedFps(fps) : t.demo.deviceFps(fps)}</p>
        <p className={styles.meterNote}>
          {replay ? strings.gauges.fpsNote : `${strings.gauges.fpsNote}; ${strings.gauges.captureCap(hz)}`}
          {slowed && !replay ? `. ${strings.gauges.slowedNote}` : ''}
        </p>
      </div>
      <div>
        <p className="stencil">{strings.gauges.production}</p>
        <p className={styles.compareValue}>{fpsMetric ? `${fpsMetric.value} ${fpsMetric.label}` : null}</p>
      </div>
    </div>
  )
}

/**
 * The three gauges (spec 3.3b: the same SLOs as production) and the comparison with the production figure.
 * Every needle and readout is fed by the pipeline's measurements: p95 of the last 60 inferences, the
 * deepest the queue has been, frames dropped. Without a detector the first gauge says it is the worker
 * pass, not inference. A dial that has measured nothing yet (nothing has been through the pipeline, or the
 * window behind it is empty) shows a dash, as THIS DEVICE does, never a zero it did not measure.
 */
export function Gauges({ engine }: { engine: Pipeline }) {
  const t = copy.services.vision
  const titleId = useId()
  const project = projectFor('vision')
  const g = useEngine(engine, (s) => ({
    depth: s.depth,
    capacity: s.capacity,
    dropped: s.droppedFrames,
    samplesDropped: s.droppedSamples,
    p95: s.p95,
    kind: s.p95Kind,
    motionOn: s.motion === 'live' || s.motion === 'waiting',
    replay: s.phase === 'replay',
    // Booleans, not the counts: frames finish ten times a second and must not re-render the gauges each time. Only the first one matters (it switches the dials on).
    framed: s.frames > 0,
    measured: queueHasReading({ frames: s.frames, samples: s.samples, depth: s.depth, droppedFrames: s.droppedFrames, droppedSamples: s.droppedSamples }),
  }))

  // Only to size the dial's scale: with no timing the scale simply stays at its smallest range.
  const p95 = g.p95 ?? 0
  const [p95Range, setP95Range] = useState<number>(P95_RANGES[0])
  const wantP95 = pickRange(p95, P95_RANGES, p95Range)
  if (wantP95 !== p95Range) setP95Range(wantP95)
  const [droppedRange, setDroppedRange] = useState<number>(DROPPED_RANGES[0])
  const wantDropped = pickRange(g.dropped, DROPPED_RANGES, droppedRange)
  if (wantDropped !== droppedRange) setDroppedRange(wantDropped)

  // The production claims, read from the data so they can never drift from the résumé.
  const sloMetric = project.metrics.find((metric) => metric.label === 'inference')
  const limit = parseLimit(sloMetric?.value)

  // What the dials mean right now, in one line under them (a per-dial note would be squeezed into a third of the width).
  const legend: string[] = []
  if (g.p95 === null) legend.push(NO_TIMING[noTimingReason({ framed: g.framed, replay: g.replay, kind: g.kind })])
  else if (g.kind === 'pass') legend.push(strings.gauges.passNote)
  else if (limit !== undefined && sloMetric) legend.push(strings.gauges.limit(sloMetric.value))
  if (g.motionOn || g.samplesDropped > 0) legend.push(strings.gauges.samplesDropped(g.samplesDropped))

  return (
    <section className={styles.gauges} aria-labelledby={titleId}>
      <div className={styles.gaugeHead}>
        <Label id={titleId}>{strings.gauges.heading}</Label>
        {g.replay ? <span className={styles.recTag}>{strings.stage.recorded}</span> : null}
      </div>
      <PlainCaption>{g.replay ? strings.gauges.plainReplay : strings.gauges.plain}</PlainCaption>
      <div className={styles.meters}>
        <div className={styles.meterCell}>
          <Meter
            label={g.kind === 'infer' ? t.demo.gauges.inference : strings.gauges.pass}
            value={g.p95}
            min={0}
            max={p95Range}
            warn={g.kind === 'infer' && limit !== undefined && limit < p95Range ? limit : undefined}
            decimals={p95 < 10 ? 1 : 0}
          />
        </div>
        <div className={styles.meterCell}>
          <Meter label={t.demo.gauges.queue} value={g.measured ? g.depth : null} min={0} max={g.capacity} warn={BACKPRESSURE_DEPTH} />
          <p className={styles.meterNote}>{strings.gauges.queueNote}</p>
        </div>
        <div className={styles.meterCell}>
          <Meter label={t.demo.gauges.dropped} value={g.measured ? g.dropped : null} min={0} max={droppedRange} />
        </div>
      </div>
      <p className={styles.meterNote}>{legend.join(' · ')}</p>
      <Compare engine={engine} />
    </section>
  )
}
