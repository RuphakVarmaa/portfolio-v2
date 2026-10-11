import type { Box } from '../../../cluster/protocol.ts'
import { MAX_TRACE_FRAMES, type TraceFile, type TraceFrame } from './TracePlayer.ts'

/**
 * The trace recorder (spec 6.7). The owner opens the site with `?record=1`, runs the camera (or the clip)
 * with the detector loaded, and downloads `vision.json`: a REAL run, with the device and date it was
 * made on. Committed to `public/traces/vision.json`, the player replays it for visitors who cannot run
 * the detector themselves. Nothing is ever synthesised: every frame in the file was completed by the
 * pipeline while this recorder was listening.
 *
 * Pure TypeScript (no DOM), tested in Recorder.test.ts.
 */

/** True when the page address asks for recording: `?record=1`. */
export function recordingRequested(search: string): boolean {
  return new URLSearchParams(search).get('record') === '1'
}

/** The parts of `navigator` that describe the device (so a test can pass a plain object). */
export interface DeviceInfo {
  userAgent?: string
  platform?: string
  hardwareConcurrency?: number
  userAgentData?: { brands?: ReadonlyArray<{ brand: string; version: string }>; platform?: string }
}

/** A browser name and major version, from User-Agent Client Hints when present, else from the UA string. */
function browserOf(info: DeviceInfo): string | null {
  const brands = info.userAgentData?.brands
  if (brands && brands.length > 0) {
    const real = brands.filter((b) => !/not.?a.?brand/i.test(b.brand))
    // Chromium browsers list "Chromium" next to their own name; prefer the own name.
    const pick = real.find((b) => !/^chromium$/i.test(b.brand)) ?? real[0]
    if (pick) return `${pick.brand} ${pick.version}`
  }
  const ua = info.userAgent ?? ''
  const named = (pattern: RegExp, name: string) => {
    const match = pattern.exec(ua)
    return match ? `${name} ${match[1]}` : null
  }
  return (
    named(/Edg\/(\d+)/, 'Edge') ??
    named(/Firefox\/(\d+)/, 'Firefox') ??
    named(/Chrome\/(\d+)/, 'Chrome') ??
    named(/Version\/(\d+)[\d.]*.*Safari/, 'Safari')
  )
}

/** `macOS, 10 cores, Google Chrome 154`: what the trace says it was recorded on. No identifiers, no IP, no UA string. */
export function describeDevice(info: DeviceInfo): string {
  const parts: string[] = []
  const platform = info.userAgentData?.platform || info.platform
  if (platform) parts.push(platform)
  if (info.hardwareConcurrency) parts.push(`${info.hardwareConcurrency} cores`)
  const browser = browserOf(info)
  if (browser) parts.push(browser)
  return parts.length > 0 ? parts.join(', ') : 'unknown device'
}

export interface RecordingStart {
  width: number
  height: number
  /** Whether a detector is producing the boxes. */
  detector: boolean
}

export interface RecordedFrame {
  /** `performance.now()` when the frame completed (the same clock as `start`). */
  at: number
  boxes: Box[]
  inferMs: number
  depth: number
  dropped: number
}

export interface Recorder {
  /** Begin a new recording at time `at` (discards any previous one). */
  start(info: RecordingStart, at: number): void
  /** Add a completed frame. Ignored when not recording; recording stops by itself at the frame cap. */
  add(frame: RecordedFrame): void
  stop(): void
  clear(): void
  readonly recording: boolean
  /** True after the cap was hit: the recording stopped by itself. */
  readonly full: boolean
  readonly count: number
  /** The finished recording, or null when there are no frames. */
  toTrace(): TraceFile | null
  toJson(): string | null
}

export interface RecorderDeps {
  device: () => string
  /** The wall-clock time a recording starts; injected so tests are exact. */
  date?: () => Date
}

export function createRecorder(deps: RecorderDeps): Recorder {
  const now = deps.date ?? (() => new Date())
  let recording = false
  let full = false
  let startedAt = 0
  let info: RecordingStart | null = null
  let date = ''
  let frames: TraceFrame[] = []

  const toTrace = (): TraceFile | null => {
    if (!info || frames.length === 0) return null
    return { device: deps.device(), date, width: info.width, height: info.height, detector: info.detector, frames: frames.slice() }
  }

  return {
    start(next, at) {
      recording = true
      full = false
      startedAt = at
      info = next
      date = now().toISOString()
      frames = []
    },
    add(frame) {
      if (!recording) return
      frames.push({
        t: Math.max(0, Math.round((frame.at - startedAt) * 10) / 10),
        boxes: frame.boxes,
        inferMs: Math.round(frame.inferMs * 10) / 10,
        depth: frame.depth,
        dropped: frame.dropped,
      })
      if (frames.length >= MAX_TRACE_FRAMES) {
        recording = false
        full = true
      }
    },
    stop() {
      recording = false
    },
    clear() {
      recording = false
      full = false
      info = null
      frames = []
    },
    get recording() {
      return recording
    },
    get full() {
      return full
    },
    get count() {
      return frames.length
    },
    toTrace,
    toJson() {
      const trace = toTrace()
      return trace ? JSON.stringify(trace) : null
    },
  }
}
