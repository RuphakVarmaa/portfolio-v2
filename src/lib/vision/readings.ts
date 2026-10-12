import type { Stage } from '../../cluster/protocol.ts'

/**
 * Small pure helpers behind the Vision gauges and the "Show me the pipeline" timeline. Kept apart from the
 * pipeline engine so they can be tested without a browser. Nothing here has a built-in measurement: every
 * function turns real numbers into something to show.
 */

// ---- meter ranges ------------------------------------------------------------------------------------

/**
 * The dial range for a value: the smallest of `steps` that holds it with a little headroom, but never less
 * than `current`. Feeding the result back in as `current` makes a range that grows and then holds, so the
 * needle never flips between two scales on a value that hovers at a boundary.
 */
export function pickRange(value: number, steps: readonly number[], current: number): number {
  const needed = value * 1.1
  const fit = steps.find((step) => step >= needed) ?? steps[steps.length - 1]
  return Math.max(current, fit)
}

// ---- dials with nothing to show yet --------------------------------------------------------------------

/** What the queue has done so far, as the two queue dials (depth, dropped) see it. */
export interface QueueActivity {
  /** Frames completed (painted) this run, and motion samples the consumer has finished. */
  frames: number
  samples: number
  /** The deepest the queue has been since the last update. */
  depth: number
  droppedFrames: number
  droppedSamples: number
}

/**
 * Has the queue measured anything yet? Until a frame or a motion sample has been through the consumer, or at least
 * been offered to the ring, the depth and drop dials have nothing to report, and a "0" there would read as a
 * measurement nobody took. They show a dash instead, as THIS DEVICE does for the frame rate. Any non-zero count is a
 * measurement in itself, so it counts before the first frame finishes: a queue that visibly holds a card is not a dash.
 */
export function queueHasReading(activity: QueueActivity): boolean {
  return activity.frames > 0 || activity.samples > 0 || activity.depth > 0 || activity.droppedFrames > 0 || activity.droppedSamples > 0
}

/** Why the first dial (worker pass or inference p95) has no number, so the line under the dials can say the right thing. */
export type NoTimingReason = 'no-frames' | 'no-inference' | 'recording-without-detector'

/**
 * The p95 dial is empty when its window holds no timing. That is so before the first frame is done, in the moment
 * after a detector loads and before its first inference finishes, and for the whole of a recorded run made without a
 * detector (the recorder stores an inference time only when a detector ran, so such a recording holds no timing at all).
 */
export function noTimingReason(state: { framed: boolean; replay: boolean; kind: 'infer' | 'pass' }): NoTimingReason {
  if (!state.framed) return 'no-frames'
  if (state.replay) return 'recording-without-detector'
  return state.kind === 'infer' ? 'no-inference' : 'no-frames'
}

// ---- backpressure ------------------------------------------------------------------------------------

export interface BackpressureTracker {
  /** Feed the deepest the queue has been since the last call, and the time. Returns whether to show "engaged". */
  update(peakDepth: number, now: number): boolean
  /** Whether it is engaged now, without feeding anything. */
  readonly engaged: boolean
  reset(): void
}

/**
 * "Backpressure engaged" while the queue is at least `threshold` deep (spec 4.4: 3 of 4), held for `holdMs`
 * after the last time it was, so a stamp that flickers for 20 ms is something a person can actually read.
 */
export function createBackpressure(threshold = 3, holdMs = 800): BackpressureTracker {
  let lastDeepAt = Number.NEGATIVE_INFINITY
  let engaged = false
  return {
    update(peakDepth, now) {
      if (peakDepth >= threshold) lastDeepAt = now
      engaged = now - lastDeepAt < holdMs
      return engaged
    },
    get engaged() {
      return engaged
    },
    reset() {
      lastDeepAt = Number.NEGATIVE_INFINITY
      engaged = false
    },
  }
}

// ---- production limits from the data -------------------------------------------------------------------

/** The number in a metric such as `<30ms`: 30. Undefined when there is no number, so no limit is drawn. */
export function parseLimit(value: string | undefined): number | undefined {
  const match = value ? /(\d+(?:\.\d+)?)/.exec(value) : null
  return match ? Number(match[1]) : undefined
}

// ---- confidence ----------------------------------------------------------------------------------------

/** Confidence as two digits, as the spec draws it on a box: 0.87 -> `87`, 0.05 -> `05`, 1 -> `99`. */
export function twoDigits(confidence: number): string {
  return String(Math.min(99, Math.max(0, Math.round(confidence * 100)))).padStart(2, '0')
}

// ---- the pipeline timeline -----------------------------------------------------------------------------

/** What one traced frame measured. Every field is a real timing from the run. */
export interface PipelineTimings {
  /** Grabbing the frame and snapshotting it for the worker (main thread). */
  captureMs: number
  /** How long the frame waited in the ring before the consumer took it. */
  queueMs: number
  /** Whether a detector session ran this frame. */
  detector: boolean
  /** Inside `session.run` (0 when no detector ran). */
  inferMs: number
  /** Letterbox plus tensor, in the worker. */
  preMs: number
  /** Decode plus NMS, in the worker (0 without a detector). */
  postMs: number
  /** From handing the frame to the scheduler to getting the answer back. */
  roundTripMs: number
  /** Dithering and painting the frame on the main thread. */
  drawMs: number
}

/** One step of the reveal: a schematic node and the stages that become known when it finishes. */
export interface PipelineStep {
  node: 'camera' | 'queue' | 'yolo' | 'react'
  stages: Stage[]
  /** Short mono text for under the node, or undefined for none. */
  annotation?: string
}

const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * Turn one traced frame into the steps the panel reveals, in the order they really happened: capture,
 * queue, the worker, draw. The stage names `capture`, `queue`, `infer` and `draw` are the ones in
 * `copy.services.vision.pipeline`; without a detector there is no `infer` stage (the panel shows a dash,
 * which is the truth) and the worker's real work is listed as `letterbox` instead. `transfer` is what the
 * worker round trip cost beyond the worker's own measured work: structured clone, scheduling, the reply.
 */
export function buildPipelineSteps(t: PipelineTimings, format: (ms: number) => string): PipelineStep[] {
  const workerOwn = t.preMs + t.inferMs + t.postMs
  const transfer = Math.max(0, t.roundTripMs - workerOwn)
  const worker: Stage[] = t.detector
    ? [
        { name: 'infer', ms: round1(t.inferMs) },
        { name: 'letterbox + decode', ms: round1(t.preMs + t.postMs) },
        { name: 'transfer', ms: round1(transfer) },
      ]
    : [
        { name: 'letterbox', ms: round1(t.preMs) },
        { name: 'transfer', ms: round1(transfer) },
      ]
  return [
    { node: 'camera', stages: [{ name: 'capture', ms: round1(t.captureMs) }], annotation: format(t.captureMs) },
    { node: 'queue', stages: [{ name: 'queue', ms: round1(t.queueMs) }], annotation: format(t.queueMs) },
    { node: 'yolo', stages: worker, annotation: t.detector ? format(t.inferMs) : undefined },
    { node: 'react', stages: [{ name: 'draw', ms: round1(t.drawMs) }], annotation: format(t.drawMs) },
  ]
}

// ---- the detector tap's size words ---------------------------------------------------------------------

/** `3.5 MB`, or `14 MB` from 10 MB up (decimal megabytes, as the files are sold and counted by the build). */
export function megabytes(bytes: number): string {
  const mb = bytes / 1e6
  return mb >= 10 ? `${Math.round(mb)} MB` : `${Math.round(mb * 10) / 10} MB`
}

/**
 * The detector tap's label with the real sizes of the files this build ships. The copy's own sentence is the
 * template (`Load the detector — 3.5 MB model + 14 MB runtime, once, cached`); only its two numbers are replaced,
 * and only when they are known, so the label can never promise a size the files do not have.
 */
export function tapLabelFor(template: string, modelBytes: number | null | undefined, runtimeBytes: number | null | undefined): string {
  let label = template
  if (modelBytes && modelBytes > 0) label = label.replace(/\d+(?:\.\d+)? MB model/, `${megabytes(modelBytes)} model`)
  if (runtimeBytes && runtimeBytes > 0) label = label.replace(/\d+(?:\.\d+)? MB runtime/, `${megabytes(runtimeBytes)} runtime`)
  return label
}
