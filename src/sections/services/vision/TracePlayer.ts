import type { Box } from '../../../cluster/protocol.ts'
import { createRateMeter, percentile } from '../../../lib/vision/stats.ts'

/**
 * The recorded-run player (spec 6.7). A trace is what `Recorder.ts` writes after a REAL run on the owner's
 * device with `?record=1`: for every completed frame the boxes, the inference time, the queue depth and
 * the running drop count. Published at `/traces/vision.json`, it lets a visitor with no camera, no SIMD or
 * a Basic-tier device watch what the detector did, clearly labelled as a recording.
 *
 * Nothing here can invent a run: `parseTrace` accepts only a file shaped like the recorder's output, and
 * the player only reads values out of it. Fabricating a trace is forbidden (spec 6.7).
 *
 * Pure TypeScript (no DOM), tested in TracePlayer.test.ts.
 */

export interface TraceFrame {
  /** Milliseconds since the run started. */
  t: number
  boxes: Box[]
  /** Time inside `session.run` for this frame (0 when no detector ran). */
  inferMs: number
  /** Ring depth when the frame completed. */
  depth: number
  /** Frames dropped so far in this run. */
  dropped: number
}

export interface TraceFile {
  /** What the run was recorded on, e.g. `MacIntel, 10 cores, Chrome 154`. */
  device: string
  /** When it was recorded, an ISO 8601 date-time. */
  date: string
  /** Frame size the boxes are expressed in, in pixels. */
  width: number
  height: number
  /** True when a detector produced the boxes; false for a queue-only run. */
  detector: boolean
  frames: TraceFrame[]
}

/** A recording longer than this is refused: it is a mistake, and it would make the file heavy. */
export const MAX_TRACE_FRAMES = 1800

export type ParsedTrace = { ok: true; trace: TraceFile } | { ok: false; error: string }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isCount = (value: unknown): value is number => isNumber(value) && Number.isInteger(value) && value >= 0

function parseBox(value: unknown): Box | null {
  if (!isRecord(value)) return null
  const { x, y, w, h, cls, conf } = value
  if (!isNumber(x) || !isNumber(y) || !isNumber(w) || !isNumber(h) || w < 0 || h < 0) return null
  if (typeof cls !== 'string' || cls.length === 0 || !isNumber(conf) || conf < 0 || conf > 1) return null
  return { x, y, w, h, cls, conf }
}

/** Validate untrusted JSON as a trace. Returns the first problem it finds, in words. */
export function parseTrace(value: unknown): ParsedTrace {
  if (!isRecord(value)) return { ok: false, error: 'the file is not a JSON object' }
  const { device, date, width, height, detector, frames } = value
  if (typeof device !== 'string' || device.length === 0) return { ok: false, error: 'device is missing' }
  if (typeof date !== 'string' || Number.isNaN(Date.parse(date))) return { ok: false, error: 'date is missing or is not a date' }
  if (!isNumber(width) || !isNumber(height) || width <= 0 || height <= 0) return { ok: false, error: 'width and height must be positive numbers' }
  if (typeof detector !== 'boolean') return { ok: false, error: 'detector must be true or false' }
  if (!Array.isArray(frames) || frames.length === 0) return { ok: false, error: 'there are no frames' }
  if (frames.length > MAX_TRACE_FRAMES) return { ok: false, error: `more than ${MAX_TRACE_FRAMES} frames` }
  const parsed: TraceFrame[] = []
  let previousT = -1
  for (const [index, frame] of frames.entries()) {
    if (!isRecord(frame)) return { ok: false, error: `frame ${index} is not an object` }
    const { t, boxes, inferMs, depth, dropped } = frame
    if (!isNumber(t) || t < 0 || t < previousT) return { ok: false, error: `frame ${index} has a bad time (times must not go backwards)` }
    if (!isNumber(inferMs) || inferMs < 0) return { ok: false, error: `frame ${index} has a bad inferMs` }
    if (!isCount(depth) || !isCount(dropped)) return { ok: false, error: `frame ${index} has a bad depth or dropped count` }
    if (!Array.isArray(boxes)) return { ok: false, error: `frame ${index} has no boxes list` }
    const parsedBoxes: Box[] = []
    for (const box of boxes) {
      const ok = parseBox(box)
      if (!ok) return { ok: false, error: `frame ${index} has a malformed box` }
      parsedBoxes.push(ok)
    }
    previousT = t
    parsed.push({ t, boxes: parsedBoxes, inferMs, depth, dropped })
  }
  return { ok: true, trace: { device, date, width, height, detector, frames: parsed } }
}

export interface TraceReading {
  index: number
  frame: TraceFrame
  /** p95 of `inferMs` over the 60 frames up to and including this one, or null when no detector ran. */
  p95: number | null
  /** Frames completed per second over the 3 s up to this frame, or null in the first moments. */
  fps: number | null
}

export interface TracePlayer {
  readonly trace: TraceFile
  /** Milliseconds from the start to the last frame. */
  readonly duration: number
  /** The reading at `t` ms into the run: the last frame at or before `t`, or null before the first one. */
  at(t: number): TraceReading | null
}

/** Index of the last frame whose time is <= t, or -1. Frames are in time order (parseTrace guarantees it). */
function indexAt(frames: readonly TraceFrame[], t: number): number {
  let low = 0
  let high = frames.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (frames[mid].t <= t) {
      found = mid
      low = mid + 1
    } else high = mid - 1
  }
  return found
}

export function createTracePlayer(trace: TraceFile): TracePlayer {
  const { frames } = trace
  return {
    trace,
    duration: frames[frames.length - 1].t,
    at(t) {
      const index = indexAt(frames, t)
      if (index < 0) return null
      const first = Math.max(0, index - 59)
      const infer = trace.detector ? frames.slice(first, index + 1).map((frame) => frame.inferMs) : []
      const meter = createRateMeter(3000, 500)
      for (let i = indexAt(frames, frames[index].t - 3000) + 1; i <= index; i++) meter.mark(frames[i].t)
      // Replaying is the reverse of recording: the rate is read at the frame's own time.
      return { index, frame: frames[index], p95: trace.detector ? percentile(infer, 95) : null, fps: meter.perSecond(frames[index].t) }
    },
  }
}
