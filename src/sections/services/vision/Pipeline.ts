import { formatMs } from '../../../cluster/format.ts'
import { announce as announceOnSite } from '../../../cluster/live-region.ts'
import type { Box } from '../../../cluster/protocol.ts'
import { scheduler as siteScheduler, type Scheduler } from '../../../cluster/scheduler.ts'
import { telemetry } from '../../../cluster/telemetry.ts'
import { getTier, getTierInfo } from '../../../cluster/tier.ts'
import { createConsumer } from '../../../lib/queue/consumer.ts'
import { createRing } from '../../../lib/queue/ring.ts'
import { ASSET_PATHS, type Availability } from '../../../lib/vision/availability.ts'
import { INPUT_SIZE } from '../../../lib/vision/letterbox.ts'
import { createPacer } from '../../../lib/vision/pacer.ts'
import { EMPTY_RACK, recentlyLost, sameCards, type LostCard, type RackCard, type RackState } from '../../../lib/vision/rack.ts'
import { buildPipelineSteps, createBackpressure, type PipelineStep, type PipelineTimings } from '../../../lib/vision/readings.ts'
import { createRateMeter, createWindow } from '../../../lib/vision/stats.ts'
import { createStore, type Store } from '../../../lib/vision/store.ts'
import type { DetectResultX, LoadPayloadX } from '../../../lib/vision/types.ts'
import { ditherBayer4, fitToWidth, fitWithin, orderTones, thumbnailBayer, toneChart, type Rgb } from './Dither.ts'
import {
  motionConstructor,
  needsMotionPermission,
  requestMotionPermission,
  startMotion as listenForMotion,
  type MotionSample,
} from './MotionProducer.ts'
import { panelStore } from './panel-store.ts'
import { createRecorder, describeDevice, recordingRequested, type Recorder } from './Recorder.ts'
import { messageText, strings } from './strings.ts'
import { createTracePlayer, type TraceFile } from './TracePlayer.ts'

/**
 * The Vision pipeline engine (spec 4.4): a real producer-consumer system, outside React.
 *
 *   producers   the camera (or the recorded clip, or one dropped image) captures at most 15 frames a
 *               second; on a phone, device motion adds up to ~60 samples a second
 *      |        both push into ONE bounded ring buffer (capacity 4, drop-oldest): src/lib/queue/ring.ts
 *      v
 *   consumer    takes ONE item at a time and waits for it: a frame is transferred (not copied) to the
 *               vision worker, which letterboxes it, runs the detector if one is loaded, and answers
 *      |        with boxes and its own timings; a motion sample is a zero-cost job on the same worker
 *      v
 *   display     the finished frame is dithered to paper and ink and painted on the one <canvas>; its boxes
 *               are drawn over it
 *
 * Everything the panel shows as a number is measured here, from real timings: the p95 over the last 60
 * inferences, the ring's depth and drop count, completed frames per second over 3 seconds. The one control
 * that is not a measurement is "slow the consumer": it adds a visible, labelled delay on purpose so a
 * healthy pipeline can be pushed into backpressure and watched.
 *
 * The camera's contract (spec 4.4, tested in Pipeline.test.ts): every stream the browser hands over is tracked,
 * and stopping (Stop, Esc, scrolling away, a hidden tab, unmounting, or replacing the source) ends every track,
 * whatever order the permission prompts were answered in. Each start is a session (`run`); an answer that
 * arrives for a session that has ended is stopped on arrival, never kept.
 */

// ---- constants -----------------------------------------------------------------------------------------

/** Ring capacity (spec 4.4). */
export const QUEUE_CAPACITY = 4
/** Depth at which "backpressure engaged" shows (spec 4.4). */
export const BACKPRESSURE_DEPTH = 3
/** Longest edge of a captured frame: what is dithered for display and sent to the worker (spec 2.5). */
export const CAPTURE_MAX = INPUT_SIZE
/** Capture rate by device tier (spec 4.4 and 6.4); the Basic tier never captures. */
export const CAPTURE_HZ = { full: 15, standard: 10, basic: 0 } as const
/** Extra milliseconds the consumer waits after each item, on purpose (the "slow the consumer" control). */
export const CONSUMER_DELAYS = { normal: 0, slow: 120, stalled: 500 } as const

const DETECT_TIMEOUT_MS = 15_000
/** How long an evicted card stays on the rack while it is bumped out, and how many at most. */
const LOST_SHOW_MS = 900
const LOST_MAX = 6
const MOTION_TIMEOUT_MS = 5_000
const MAX_IMAGE_BYTES = 20_000_000
const NO_MOTION_AFTER_MS = 1500
const REVEAL_DWELL_MS = 260
const TRACE_WAIT_MS = 6000
const MODEL_URL = `/${ASSET_PATHS.model}`
const CLIP_URL = `/${ASSET_PATHS.clip}`
const WASM_BASE = '/ort/'

// ---- public types --------------------------------------------------------------------------------------

export type ConsumerSpeed = keyof typeof CONSUMER_DELAYS
export type Facing = 'user' | 'environment'
export type Phase = 'idle' | 'starting' | 'live' | 'still' | 'replay'
export type StopReason = 'user' | 'esc' | 'scroll' | 'hidden' | 'unmount'
export type MotionState = 'off' | 'asking' | 'waiting' | 'live' | 'denied' | 'none'
/** Can this device run the pipeline at all? `checking` until the first look. */
export type Capability = 'checking' | 'ok' | 'basic' | 'unsupported'
export type DetectorStatus = 'unknown' | 'absent' | 'available' | 'loading' | 'ready' | 'failed'
export type SourceKind = 'none' | 'camera' | 'clip' | 'image' | 'replay'

/**
 * Can a visitor use the detector here: one ships with this build, it has not failed to load, and this browser can
 * run it (the ONNX runtime needs WebAssembly SIMD)? Only then does a picture of their own have anything to be run
 * through, so only then is "Or drop an image" offered, and only then does the camera dialog say a detector runs
 * (spec section 10, item 5: with no model the drop-image control is hidden). `unknown` is the first moment,
 * before the build's inventory has been read, and counts as no: nothing is promised that is not known.
 */
export const detectorUsable = (status: DetectorStatus, simd: boolean): boolean =>
  simd && (status === 'available' || status === 'loading' || status === 'ready')

/**
 * What the engine reaches outside itself for. The site uses the defaults; `Pipeline.test.ts` hands in fakes, so
 * the camera's lifecycle (the part that must never leave the camera light on) is tested without a browser, a
 * worker or a real permission prompt.
 */
export interface PipelineDeps {
  scheduler: Pick<Scheduler, 'isSupported' | 'ensureService' | 'submit' | 'getState'>
  /** Says a sentence in the page's one live region. */
  announce: (text: string) => void
  /** `navigator.mediaDevices`, looked up whenever the camera is used (undefined on an insecure page or an old browser). */
  mediaDevices: () => MediaDevices | undefined
}

/** The status line's content as data; `messageText` (strings.ts) turns it into a sentence. */
export type Message =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'live'; width: number; height: number; hz: number }
  | { kind: 'clip' }
  | { kind: 'still'; name: string }
  | { kind: 'replay' }
  | { kind: 'denied' }
  | { kind: 'no-camera' }
  | { kind: 'busy' }
  | { kind: 'camera-error' }
  | { kind: 'stopped'; why: StopReason }
  | { kind: 'image-error' }
  | { kind: 'image-large' }
  | { kind: 'worker-error'; text: string }
  | { kind: 'frame-dropped' }

export interface DetectorSnapshot {
  status: DetectorStatus
  /** The published model's quantisation (`int8` or `fp16`), once known. */
  quant: string | null
  /** The real size of the model file and of the ONNX runtime this build ships (null while unknown), for the tap's label. */
  modelBytes: number | null
  runtimeBytes: number | null
  /** Bytes fetched so far (runtime plus model) and the total, or 0 when the total is unknown. */
  loaded: number
  total: number
  stage: 'runtime' | 'model' | 'session' | null
  /** Why it failed, in the worker's own words. */
  error: string | null
}

export interface RecordSnapshot {
  enabled: boolean
  recording: boolean
  count: number
  full: boolean
}

export interface EngineSnapshot {
  capability: Capability
  /** Why the pipeline cannot run here, in a few words, when `capability` is `unsupported`. */
  capabilityReason: string
  phase: Phase
  source: SourceKind
  message: Message
  facing: Facing
  canFlip: boolean
  /** Frame size being processed (after fitting to the capture box). */
  width: number
  height: number
  motion: MotionState
  hasClip: boolean
  hasTrace: boolean
  // measurements
  /** Deepest the queue got since the last update. */
  depth: number
  capacity: number
  droppedFrames: number
  droppedSamples: number
  /** Frames completed (displayed) this session, and motion samples consumed. */
  frames: number
  samples: number
  /** Completed frames per second over the last 3 s, or null until it can be said. Held at its last value after a stop. */
  fps: number | null
  /** p95 of the last 60 inference times (`infer`), or of the worker pass without a detector (`pass`). Null with no samples yet. */
  p95: number | null
  p95Kind: 'infer' | 'pass'
  backpressure: boolean
  speed: ConsumerSpeed
  failures: number
  detector: DetectorSnapshot
  record: RecordSnapshot
}

export interface FrameState {
  /** Increments with every painted frame. */
  seq: number
  width: number
  height: number
  boxes: readonly Box[]
  /** Whether a detector produced `boxes` (an empty list is only "nothing found" when it did). */
  detector: boolean
}

export interface Pipeline {
  readonly store: Store<EngineSnapshot>
  readonly frames: Store<FrameState>
  /** What is really in the queue (and what it just threw out), for the rack drawing. */
  readonly rack: Store<RackState>
  /** Give the engine its canvas and hidden video element. Returns the detach function. */
  attach(elements: { canvas: HTMLCanvasElement; video: HTMLVideoElement }): () => void
  setPalette(ink: Rgb, paper: Rgb): void
  /** The widest the picture can be shown, in CSS pixels. The dither is drawn at the size it is shown, so every dither pixel is a whole number of screen pixels. */
  setDisplayWidth(cssPx: number): void
  /** The two tones the picture is dithered between right now (the rack's thumbnails use the same). */
  palette(): { dark: Rgb; light: Rgb }
  setLite(lite: boolean): void
  setAvailability(availability: Availability): void
  /** Spawn the vision worker and check it can read frames. Idempotent. */
  prepare(): void
  startCamera(options?: { facing?: Facing; loadDetector?: boolean }): Promise<void>
  flipCamera(): Promise<void>
  startClip(): Promise<void>
  showImage(file: File): Promise<void>
  startReplay(trace: TraceFile): void
  /** End a replay without saying anything. */
  stopReplay(): void
  stop(reason: StopReason): void
  startMotion(): Promise<void>
  stopMotion(): void
  setSpeed(speed: ConsumerSpeed): void
  loadDetector(): Promise<void>
  runPipeline(): Promise<void>
  startRecording(): void
  stopRecording(): void
  clearRecording(): void
  /** The recording as a JSON string for download, or null when there is nothing. */
  recordingJson(): string | null
}

// ---- internals -----------------------------------------------------------------------------------------

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  promise.catch(() => undefined) // whoever awaits it still sees the rejection; nobody else gets a console error
  return { promise, resolve, reject }
}

interface FrameItem {
  kind: 'frame'
  /** Unique for the session: what the rack follows from the queue to the worker. */
  id: number
  /** Capture number within this source (`#12`). */
  n: number
  /** The session this frame belongs to; a frame from a stopped session is not painted. */
  run: number
  ts: number
  enqueuedAt: number
  bitmap: ImageBitmap
  /** The captured pixels, RGBA. Dithered when (and only if) the frame is painted. */
  raw: Uint8ClampedArray
  width: number
  height: number
  captureMs: number
  /** Set when "Show me the pipeline" asked for this frame to be timed. */
  trace: Deferred<PipelineTimings> | null
}

interface MotionItem {
  kind: 'motion'
  id: number
  /** Sample number within this motion session. */
  n: number
  ts: number
  ax: number
  ay: number
  az: number
}

type Item = FrameItem | MotionItem

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** What the rack draws for an item in the queue: the same frame or sample, nothing added. */
const cardOf = (item: Item): RackCard =>
  item.kind === 'frame'
    ? { id: item.id, kind: 'frame', n: item.n, raw: item.raw, width: item.width, height: item.height, axes: null }
    : { id: item.id, kind: 'motion', n: item.n, raw: null, width: 0, height: 0, axes: [item.ax, item.ay, item.az] }
const round1 = (value: number) => Math.round(value * 10) / 10

function cameraFailure(error: unknown): Message {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return { kind: 'denied' }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return { kind: 'no-camera' }
  if (name === 'NotReadableError' || name === 'AbortError') return { kind: 'busy' }
  return { kind: 'camera-error' }
}

const EMPTY_DETECTOR: DetectorSnapshot = { status: 'unknown', quant: null, modelBytes: null, runtimeBytes: null, loaded: 0, total: 0, stage: null, error: null }

export function createPipeline(overrides: Partial<PipelineDeps> = {}): Pipeline {
  const scheduler = overrides.scheduler ?? siteScheduler
  const announce = overrides.announce ?? announceOnSite
  const mediaDevices = overrides.mediaDevices ?? (() => (typeof navigator === 'undefined' ? undefined : navigator.mediaDevices))

  const store = createStore<EngineSnapshot>({
    capability: 'checking',
    capabilityReason: '',
    phase: 'idle',
    source: 'none',
    message: { kind: 'idle' },
    facing: 'environment',
    canFlip: false,
    width: 320,
    height: 240,
    motion: 'off',
    hasClip: false,
    hasTrace: false,
    depth: 0,
    capacity: QUEUE_CAPACITY,
    droppedFrames: 0,
    droppedSamples: 0,
    frames: 0,
    samples: 0,
    fps: null,
    p95: null,
    p95Kind: 'pass',
    backpressure: false,
    speed: 'normal',
    failures: 0,
    detector: EMPTY_DETECTOR,
    record: { enabled: false, recording: false, count: 0, full: false },
  })
  const frames = createStore<FrameState>({ seq: 0, width: 320, height: 240, boxes: [], detector: false })
  const rack = createStore<RackState>(EMPTY_RACK)

  // ---- state ----
  let canvas: HTMLCanvasElement | null = null
  let context: CanvasRenderingContext2D | null = null
  let video: HTMLVideoElement | null = null
  // The camera: EVERY stream the browser has handed over that has not been stopped yet, not only the one on the
  // viewfinder. The set is the safety net behind the session check in `startCamera`: whatever else goes wrong,
  // stopping the source stops every track the page has ever been given (spec 4.4: `readyState === 'ended'`).
  const streams = new Set<MediaStream>()
  let capture: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null = null
  let paintData: ImageData | null = null
  // The darker and the lighter of the theme's two inks: dark pixels always map to the darker one, so a picture never turns into its negative.
  let palette: { dark: Rgb; light: Rgb } = { dark: [28, 27, 24], light: [243, 238, 228] }
  let lastPainted: { raw: Uint8ClampedArray; width: number; height: number } | null = null
  let displayMax = CAPTURE_MAX
  let availability: Availability | null = null
  let lite = false
  let prepared = false

  let run = 0 // bumped whenever a session starts or stops; stale callbacks compare against it
  let loopToken = 0
  let capturing = false
  let phase: Phase = 'idle'
  let seq = 0
  let stillBitmap: ImageBitmap | null = null
  let pendingTrace: Deferred<PipelineTimings> | null = null
  let pipelineBusy = false

  // measurements
  const inferWindow = createWindow(60)
  const passWindow = createWindow(60)
  const rate = createRateMeter(3000, 500)
  const backpressure = createBackpressure(BACKPRESSURE_DEPTH, 800)
  let peakDepth = 0
  // what the queue really holds, for the rack drawing
  let itemId = 0
  let frameCount = 0
  let sampleCount = 0
  /** The item the worker took most recently. */
  let taken: Item | null = null
  /** The worker took something since the last update: a fast worker is idle at most instants, but it is plainly working. */
  let workedSince = false
  let lost: LostCard[] = []
  let tone = 0
  let droppedFrames = 0
  let droppedSamples = 0
  let completed = 0
  let samplesDone = 0
  let failures = 0
  let lastFps: number | null = null
  let wasEngaged = false
  let lastErrorText = ''
  let speed: ConsumerSpeed = 'normal'

  // motion
  let stopListening: (() => void) | null = null
  let motionTimer: ReturnType<typeof setTimeout> | undefined
  let motionAsk = 0

  // the detector
  let detectorStatus: DetectorStatus = 'unknown'
  let detectorSpawnedAt: number | null = null
  let loadingDetector: Promise<void> | null = null
  const detectorInfo: DetectorSnapshot = { ...EMPTY_DETECTOR }

  // replay
  let replayFrame = 0

  // the recorder (the owner's switch: ?record=1)
  const recordingEnabled = typeof location !== 'undefined' && recordingRequested(location.search)
  const recorder: Recorder | null = recordingEnabled
    ? createRecorder({
        device: () =>
          describeDevice({
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency,
            userAgentData: (navigator as Navigator & { userAgentData?: { brands?: Array<{ brand: string; version: string }>; platform?: string } })
              .userAgentData,
          }),
      })
    : null

  let tickTimer: ReturnType<typeof setInterval> | undefined

  // ---- the queue ----

  const ring = createRing<Item>(QUEUE_CAPACITY, {
    onDrop: (item) => {
      lost.push({ card: cardOf(item), at: performance.now() })
      if (item.kind === 'frame') {
        item.bitmap.close()
        droppedFrames += 1
        item.trace?.reject(new Error('dropped'))
      } else droppedSamples += 1
    },
  })

  const consumer = createConsumer<Item>({
    ring,
    process: (item) => processItem(item),
    delayMs: () => CONSUMER_DELAYS[speed],
    onError: (error) => {
      failures += 1
      const text = error instanceof Error ? error.message : 'unknown error'
      // The same sentence ten times a second helps nobody: say it once until something else happens.
      if (text !== lastErrorText && !/cancel|abort/i.test(text)) {
        lastErrorText = text
        store.patch({ message: { kind: 'worker-error', text } })
      }
    },
    onSettled: () => {
      if (ring.depth > peakDepth) peakDepth = ring.depth
    },
  })

  function enqueue(item: Item) {
    ring.push(item)
    if (ring.depth > peakDepth) peakDepth = ring.depth
    consumer.wake()
  }

  // ---- publishing ----

  /** Whether this device can run the pipeline, and if not, why (in words a visitor can read). */
  const probe = (): { capability: Capability; reason: string } => {
    if (getTier() === 'basic') return { capability: 'basic', reason: '' }
    if (!scheduler.isSupported()) return { capability: 'unsupported', reason: 'Web Workers are not available.' }
    if (typeof OffscreenCanvas === 'undefined') return { capability: 'unsupported', reason: 'OffscreenCanvas is not available.' }
    if (typeof createImageBitmap !== 'function') return { capability: 'unsupported', reason: 'createImageBitmap is not available.' }
    return { capability: 'ok', reason: '' }
  }
  const capabilityNow = (): Capability => probe().capability

  const captureHz = () => CAPTURE_HZ[getTier()] || CAPTURE_HZ.standard

  function syncRecord() {
    if (!recorder) return
    const next: RecordSnapshot = { enabled: true, recording: recorder.recording, count: recorder.count, full: recorder.full }
    const previous = store.get().record
    if (previous.enabled !== next.enabled || previous.recording !== next.recording || previous.count !== next.count || previous.full !== next.full) {
      store.patch({ record: next })
    }
  }

  /** Hand the rack what the queue holds: patched only when something on the rack actually changed. */
  function publishRack(now: number, shown: readonly Item[]) {
    lost = recentlyLost(lost, now, LOST_SHOW_MS, LOST_MAX)
    const current = rack.get()
    const queued = shown.map(cardOf)
    const gone = lost.map((entry) => entry.card)
    const busy = consumer.busy || workedSince
    workedSince = false
    const unchanged =
      sameCards(queued, current.queued) && (current.working?.id ?? -1) === (taken?.id ?? -1) && current.busy === busy && sameCards(gone, current.lost)
    if (!unchanged) rack.patch({ queued, working: taken ? cardOf(taken) : null, busy, lost: gone })
  }

  function emptyRack() {
    taken = null
    lost = []
    rack.patch({ queued: EMPTY_RACK.queued, working: null, busy: false, lost: EMPTY_RACK.lost })
  }

  function publish() {
    if (phase === 'replay') return // a replay writes its own readings
    const now = performance.now()
    const peak = Math.max(peakDepth, ring.depth)
    peakDepth = ring.depth
    // The rack is the queue as it is right now; the depth gauge keeps the deepest it got since the last update.
    publishRack(now, ring.toArray())
    const engaged = backpressure.update(peak, now)
    if (engaged !== wasEngaged) {
      wasEngaged = engaged
      announce(engaged ? strings.announce.backpressureOn : strings.announce.backpressureOff)
    }
    const running = phase === 'live' || phase === 'starting'
    const fps = rate.perSecond(now)
    if (running && fps !== null) lastFps = Math.round(fps)
    const useInfer = detectorStatus === 'ready'
    const p95 = (useInfer ? inferWindow : passWindow).percentile(95)
    store.patch({
      depth: peak,
      droppedFrames,
      droppedSamples,
      frames: completed,
      samples: samplesDone,
      fps: lastFps,
      p95: p95 === null ? null : round1(p95),
      p95Kind: useInfer ? 'infer' : 'pass',
      backpressure: engaged,
      failures,
    })
    syncRecord()
  }

  const isActive = () =>
    phase === 'live' || phase === 'starting' || phase === 'still' || stopListening !== null || pipelineBusy || ring.depth > 0 || lost.length > 0

  function ensureTick() {
    if (tickTimer !== undefined) return
    tickTimer = setInterval(
      () => {
        publish()
        if (!isActive() && !backpressure.engaged) {
          clearInterval(tickTimer)
          tickTimer = undefined
          publish()
        }
      },
      lite ? 500 : 100,
    )
  }

  function setLite(value: boolean) {
    if (lite === value) return
    lite = value
    if (tickTimer !== undefined) {
      clearInterval(tickTimer)
      tickTimer = undefined
      ensureTick()
    }
  }

  function resetMeasurements() {
    inferWindow.clear()
    passWindow.clear()
    rate.clear()
    backpressure.reset()
    wasEngaged = false
    peakDepth = 0
    frameCount = 0
    sampleCount = 0
    emptyRack()
    droppedFrames = 0
    droppedSamples = 0
    completed = 0
    samplesDone = 0
    failures = 0
    lastFps = null
    lastErrorText = ''
    store.patch({ depth: 0, droppedFrames: 0, droppedSamples: 0, frames: 0, samples: 0, fps: null, p95: null, backpressure: false, failures: 0 })
  }

  // ---- the schematic, as far as the panel is concerned ----

  const baselineActive = (): string[] => (phase === 'live' ? ['camera', 'queue', ...(detectorStatus === 'ready' ? ['yolo'] : [])] : [])

  function setPhase(next: Phase, source: SourceKind, message: Message) {
    phase = next
    store.patch({ phase: next, source, message })
    if (!pipelineBusy) panelStore.patch({ active: baselineActive() })
    ensureTick()
  }

  // ---- drawing ----

  /** Dither `raw` to paper and ink and paint it on the one canvas. */
  function paintRaw(raw: Uint8ClampedArray, width: number, height: number) {
    if (!canvas || !context) return
    // The canvas is drawn at the size it is shown (never larger than the frame): on a narrow phone the 320 px
    // frame is averaged down to what fits, instead of being squeezed by the browser into uneven dither pixels.
    const shown = fitToWidth(width, height, displayMax)
    if (canvas.width !== shown.width || canvas.height !== shown.height) {
      canvas.width = shown.width
      canvas.height = shown.height
      paintData = null
    }
    paintData ??= new ImageData(shown.width, shown.height)
    if (shown.width === width && shown.height === height) ditherBayer4(raw, width, height, palette.dark, palette.light, paintData.data)
    else thumbnailBayer(raw, width, height, shown.width, shown.height, palette.dark, palette.light, paintData.data)
    context.putImageData(paintData, 0, 0)
    lastPainted = { raw, width, height }
  }

  /** Draw again what is on the stage (the theme or the available width changed). */
  function repaint() {
    if (lastPainted) paintRaw(lastPainted.raw, lastPainted.width, lastPainted.height)
    else if (phase === 'idle' || phase === 'replay') paintIdle()
  }

  function paintIdle() {
    const width = 320
    const height = 240
    paintRaw(toneChart(width, height), width, height)
    lastPainted = null
    frames.patch({ seq: ++seq, width, height, boxes: [], detector: false })
    store.patch({ width, height })
  }

  // ---- capture ----

  /**
   * Draw a source into the capture canvas, read its pixels for display, and snapshot it for the worker.
   * The pixels are read before the first `await`, so another capture cannot change them under this one.
   */
  async function grab(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, trace: Deferred<PipelineTimings> | null): Promise<FrameItem> {
    const started = performance.now()
    const { width, height } = fitWithin(sourceWidth, sourceHeight, CAPTURE_MAX)
    if (!capture || capture.canvas.width !== width || capture.canvas.height !== height) {
      const element = document.createElement('canvas')
      element.width = width
      element.height = height
      const ctx = element.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('This browser would not give the page a 2D canvas')
      capture = { canvas: element, context: ctx }
    }
    const surface = capture
    surface.context.drawImage(source, 0, 0, width, height)
    const raw = surface.context.getImageData(0, 0, width, height).data
    const bitmap = await createImageBitmap(surface.canvas)
    const now = performance.now()
    return { kind: 'frame', id: ++itemId, n: ++frameCount, run, ts: now, enqueuedAt: now, bitmap, raw, width, height, captureMs: now - started, trace }
  }

  const takeTrace = () => {
    const trace = pendingTrace
    pendingTrace = null
    return trace
  }

  async function captureVideo(token: number) {
    const element = video
    if (!element || capturing) return
    capturing = true
    const trace = takeTrace()
    try {
      const item = await grab(element, element.videoWidth, element.videoHeight, trace)
      if (token !== loopToken) {
        item.bitmap.close()
        trace?.reject(new Error('stopped'))
        return
      }
      const known = store.get()
      if (item.width !== known.width || item.height !== known.height) store.patch({ width: item.width, height: item.height })
      enqueue(item)
    } catch (error) {
      trace?.reject(error)
    } finally {
      capturing = false
    }
  }

  /** Grab frames from the playing video at the capture rate: on each presented video frame where supported, else on animation frames. */
  function startCaptureLoop(token: number) {
    const element = video
    if (!element) return
    // A schedule, not "one period since the last frame": a 20 fps camera under a 15 Hz cap then gives 15, not 10.
    const pacer = createPacer(1000 / captureHz())
    const request = (callback: () => void) => {
      if ('requestVideoFrameCallback' in element) element.requestVideoFrameCallback(() => callback())
      else requestAnimationFrame(() => callback())
    }
    const step = () => {
      if (token !== loopToken || !video) return
      const now = performance.now()
      if (!capturing && element.readyState >= 2 && element.videoWidth > 0 && pacer.ready(now)) void captureVideo(token)
      request(step)
    }
    request(step)
  }

  // ---- consuming ----

  const detectorSpawn = () => scheduler.getState().nodes['vision-a']?.spawnedAt ?? null

  async function processItem(item: Item): Promise<void> {
    taken = item
    workedSince = true
    if (item.kind === 'motion') {
      await scheduler.submit('vision.motion', { ax: item.ax, ay: item.ay, az: item.az, ts: item.ts }, { maxAttempts: 1, timeoutMs: MOTION_TIMEOUT_MS }).promise
      samplesDone += 1
      return
    }
    if (item.run !== run && !item.trace) {
      item.bitmap.close()
      return
    }
    // The worker was restarted (unplugged, crashed, timed out): its session is gone. Load it again, quietly.
    if (detectorStatus === 'ready' && detectorSpawn() !== detectorSpawnedAt) {
      detectorStatus = 'available'
      setDetector({ status: 'available', stage: null })
      void loadDetector()
    }
    const dequeued = performance.now()
    const queueMs = dequeued - item.enqueuedAt
    let result: DetectResultX
    try {
      const handle = scheduler.submit('vision.detect', { bitmap: item.bitmap, ts: item.ts }, { transfer: [item.bitmap], maxAttempts: 1, timeoutMs: DETECT_TIMEOUT_MS })
      result = (await handle.promise) as DetectResultX
    } catch (error) {
      item.trace?.reject(error)
      throw error
    }
    const roundTripMs = performance.now() - dequeued
    const ranDetector = result.detector === true

    // A frame from a session that has since ended is never painted or counted (it may still carry a timing request).
    let drawMs = 0
    if (item.run === run) {
      const drawStart = performance.now()
      paintRaw(item.raw, item.width, item.height)
      drawMs = performance.now() - drawStart
      frames.patch({ seq: ++seq, width: item.width, height: item.height, boxes: result.boxes, detector: ranDetector })
      completed += 1
      rate.mark(performance.now())
      ;(ranDetector ? inferWindow : passWindow).push(ranDetector ? result.inferMs : (result.preMs ?? 0))
      recorder?.add({ at: performance.now(), boxes: result.boxes, inferMs: ranDetector ? result.inferMs : 0, depth: ring.depth, dropped: droppedFrames })
      lastErrorText = ''
    }
    item.trace?.resolve({
      captureMs: item.captureMs,
      queueMs,
      detector: ranDetector,
      inferMs: ranDetector ? result.inferMs : 0,
      preMs: result.preMs ?? 0,
      postMs: result.postMs ?? 0,
      roundTripMs,
      drawMs,
    })
  }

  // ---- stopping ----

  function stopTracks(media: MediaStream | null) {
    media?.getTracks().forEach((track) => track.stop())
  }

  /** Stop one stream the browser handed over, and forget it. */
  function stopStream(media: MediaStream) {
    stopTracks(media)
    streams.delete(media)
  }

  /** The camera light goes out: every stream this engine has been given is stopped, whichever session asked for it. */
  function stopCamera() {
    for (const media of streams) stopTracks(media)
    streams.clear()
  }

  function releaseVideo() {
    if (!video) return
    video.pause()
    video.srcObject = null
    video.removeAttribute('src')
    video.load()
  }

  /**
   * End whatever is running: the camera light goes out (every track is stopped), the capture loop ends, the
   * queue is emptied (each waiting frame is closed), and the stage returns to the test card. `silent` is for
   * replacing one source with another, which should not say "stopped".
   */
  function stopSource(reason: StopReason, silent: boolean) {
    const hadSource = phase !== 'idle'
    // Bumping `run` ends every session started so far. A camera prompt that is still open belongs to one of them, and
    // its stream is stopped the moment the browser delivers it (see `startCamera`); every stream already delivered
    // is stopped here, first, so nothing below can leave the light on.
    run += 1
    loopToken += 1
    stopCamera()
    capturing = false
    pendingTrace?.reject(new Error('stopped'))
    pendingTrace = null
    cancelAnimationFrame(replayFrame)
    releaseVideo()
    for (const item of ring.drain()) {
      if (item.kind !== 'frame') continue
      item.bitmap.close()
      item.trace?.reject(new Error('stopped'))
    }
    emptyRack()
    stillBitmap?.close()
    stillBitmap = null
    if (hadSource) {
      phase = 'idle'
      store.patch({ phase: 'idle', source: 'none', canFlip: false, ...(silent ? {} : { message: { kind: 'stopped', why: reason } as Message }) })
      recorder?.stop()
      paintIdle()
      panelStore.patch({ active: baselineActive() })
      if (!silent && reason !== 'unmount') announce(messageText({ kind: 'stopped', why: reason }))
    }
    publish()
  }

  // ---- sources ----

  const canRun = () => capabilityNow() === 'ok'

  /** "Or drop an image" is offered only where a detector can be used, so a status line only points at it then. */
  const canDrop = () => detectorUsable(detectorStatus, getTierInfo().simd)

  function fail(message: Message) {
    phase = 'idle'
    releaseVideo()
    store.patch({ phase: 'idle', source: 'none', message })
    panelStore.patch({ active: baselineActive() })
    announce(messageText(message, canDrop()))
  }

  async function waitForFrames(element: HTMLVideoElement, myRun: number): Promise<boolean> {
    if (myRun !== run) return false // the session ended while the video was starting; whoever ended it has cleaned up
    if (element.readyState >= 2 && element.videoWidth > 0) return true
    await new Promise<void>((resolve) => {
      const done = () => {
        element.removeEventListener('loadeddata', done)
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(done, 5000)
      element.addEventListener('loadeddata', done)
    })
    return myRun === run && element.videoWidth > 0
  }

  /**
   * Open a video source (the camera or the clip), wait for real frames, start the capture loop. False if it did not
   * start. `open` is told which session it belongs to: it must not touch the viewfinder, or keep anything it was
   * handed, unless that session is still the current one when its answer arrives.
   */
  async function startVideoSource(
    kind: 'camera' | 'clip',
    open: (element: HTMLVideoElement, myRun: number) => Promise<void>,
    liveMessage: (width: number, height: number) => Message,
  ): Promise<boolean> {
    const element = video
    if (!element) return false
    const myRun = ++run
    const token = ++loopToken
    resetMeasurements()
    setPhase('starting', kind, { kind: 'starting' })
    try {
      await open(element, myRun)
    } catch (error) {
      if (myRun !== run) return false // stopped or replaced while it was opening: whoever did that owns the state now
      stopCamera()
      fail(kind === 'camera' ? cameraFailure(error) : { kind: 'camera-error' })
      return false
    }
    if (myRun !== run) return false
    try {
      await element.play()
    } catch {
      /* autoplay refused: the user's gesture normally allows it; readyState below decides */
    }
    const gotFrames = await waitForFrames(element, myRun)
    if (myRun !== run) return false // stopped or replaced in the instant between "frames arrived" and here
    if (!gotFrames) {
      stopCamera()
      fail({ kind: 'camera-error' })
      return false
    }
    const fitted = fitWithin(element.videoWidth, element.videoHeight, CAPTURE_MAX)
    store.patch({ width: fitted.width, height: fitted.height })
    setPhase('live', kind, liveMessage(fitted.width, fitted.height))
    startCaptureLoop(token)
    return true
  }

  async function startCamera(options: { facing?: Facing; loadDetector?: boolean } = {}) {
    const devices = mediaDevices()
    if (!canRun() || !devices?.getUserMedia) return
    stopSource('user', true)
    const facing = options.facing ?? store.get().facing
    store.patch({ facing })
    prepare()
    const ok = await startVideoSource(
      'camera',
      async (element, myRun) => {
        const media = await devices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 640 } }, audio: false })
        streams.add(media)
        // The browser answers when the person does, which can be after Stop, after Esc, or after a newer start: the
        // first prompt is never guaranteed to be the last one answered. A stream that arrives for a session that has
        // ended is stopped on the spot, so the camera light never outlives the click that asked for it. This must be
        // checked against the session (`run`), not only the phase: a newer start has already put the phase back to
        // "starting", which is exactly what let the first stream slip through and then be overwritten and lost.
        if (myRun !== run || phase !== 'starting') {
          stopStream(media)
          throw new DOMException('cancelled', 'AbortError')
        }
        element.srcObject = media
      },
      (width, height) => ({ kind: 'live', width, height, hz: captureHz() }),
    )
    if (!ok) return
    announce(strings.announce.cameraLive)
    void devices
      .enumerateDevices()
      .then((found) => {
        if (phase === 'live') store.patch({ canFlip: found.filter((device) => device.kind === 'videoinput').length > 1 })
      })
      .catch(() => undefined)
    if (options.loadDetector) void loadDetector()
  }

  async function flipCamera() {
    await startCamera({ facing: store.get().facing === 'environment' ? 'user' : 'environment' })
  }

  async function startClip() {
    if (!canRun() || !availability?.clip) return
    stopSource('user', true)
    prepare()
    const ok = await startVideoSource(
      'clip',
      async (element) => {
        element.loop = true
        element.src = CLIP_URL
      },
      () => ({ kind: 'clip' }),
    )
    if (ok) announce(strings.announce.clipLive)
  }

  /** (Re)send the shown image through the pipeline: when it is first dropped, and again once a detector has loaded. */
  async function rerunStill() {
    const bitmap = stillBitmap
    if (!bitmap || phase !== 'still') return
    const myRun = run
    const trace = takeTrace()
    try {
      const item = await grab(bitmap, bitmap.width, bitmap.height, trace)
      if (myRun !== run) {
        item.bitmap.close()
        trace?.reject(new Error('stopped'))
        return
      }
      enqueue(item)
    } catch (error) {
      trace?.reject(error) // the image is gone or unreadable: leave what is on screen
    }
  }

  async function showImage(file: File) {
    if (!canRun()) return
    if (!file.type.startsWith('image/')) {
      store.patch({ message: { kind: 'image-error' } })
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      store.patch({ message: { kind: 'image-large' } })
      return
    }
    stopSource('user', true)
    const myRun = ++run
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      if (myRun === run) store.patch({ message: { kind: 'image-error' } })
      return
    }
    if (myRun !== run) {
      bitmap.close()
      return
    }
    prepare()
    stillBitmap = bitmap
    resetMeasurements()
    setPhase('still', 'image', { kind: 'still', name: file.name.slice(0, 60) })
    await rerunStill()
  }

  // ---- motion ----

  function onMotion(sample: MotionSample) {
    if (store.get().motion === 'waiting') {
      clearTimeout(motionTimer)
      store.patch({ motion: 'live' })
    }
    enqueue({ kind: 'motion', id: ++itemId, n: ++sampleCount, ts: sample.ts, ax: sample.ax, ay: sample.ay, az: sample.az })
  }

  async function startMotion() {
    if (!canRun() || stopListening) return
    prepare()
    const asking = ++motionAsk
    const ctor = motionConstructor()
    if (needsMotionPermission(ctor)) {
      store.patch({ motion: 'asking' })
      const answer = await requestMotionPermission(ctor)
      if (asking !== motionAsk) return
      if (answer !== 'granted') {
        store.patch({ motion: 'denied' })
        return
      }
    }
    droppedSamples = 0
    samplesDone = 0
    sampleCount = 0
    store.patch({ motion: 'waiting' })
    stopListening = listenForMotion(onMotion)
    motionTimer = setTimeout(() => {
      if (store.get().motion !== 'waiting') return
      // No real sample in 1.5 s: this device has no motion sensor (a desktop fires nothing, or one empty event).
      stopListening?.()
      stopListening = null
      store.patch({ motion: 'none' })
    }, NO_MOTION_AFTER_MS)
    ensureTick()
  }

  function stopMotion() {
    motionAsk += 1
    clearTimeout(motionTimer)
    stopListening?.()
    stopListening = null
    if (store.get().motion !== 'off') store.patch({ motion: 'off' })
  }

  // ---- the detector ----

  function setDetector(patch: Partial<DetectorSnapshot>) {
    Object.assign(detectorInfo, patch)
    store.patch({ detector: { ...detectorInfo } })
  }

  function setAvailability(next: Availability) {
    availability = next
    const status: DetectorStatus = next.detector ? (detectorStatus === 'ready' || detectorStatus === 'loading' ? detectorStatus : 'available') : 'absent'
    detectorStatus = status
    setDetector({ status, quant: next.detector?.quant ?? null, modelBytes: next.detector?.bytes ?? null, runtimeBytes: next.runtimeBytes })
    store.patch({ hasClip: next.clip, hasTrace: next.trace })
    // The panel's always-visible captions say whether a detector runs here, so they follow what this build ships.
    panelStore.patch({ detector: next.detector ? 'published' : 'absent' })
  }

  async function loadDetector() {
    const meta = availability?.detector
    if (!meta || !canRun() || detectorStatus === 'ready') return
    if (loadingDetector) return loadingDetector
    detectorStatus = 'loading'
    setDetector({ status: 'loading', loaded: 0, total: 0, stage: 'runtime', error: null })
    announce(strings.announce.detectorLoading)
    loadingDetector = (async () => {
      try {
        await scheduler.ensureService('vision')
        const runtimeBytes = availability?.runtimeBytes ?? undefined
        const payload: LoadPayloadX = {
          modelUrl: MODEL_URL,
          wasmBase: WASM_BASE,
          inputSize: INPUT_SIZE,
          modelBytes: meta.bytes,
          wasmBytes: runtimeBytes,
          classes: meta.classes,
        }
        const handle = scheduler.submit('vision.loadModel', payload, {
          onProgress: (progress) => {
            const loaded = progress.bytesLoaded ?? 0
            const total = progress.bytesTotal ?? 0
            telemetry.recordModelBytes('vision', loaded, total > 0 ? total : null)
            const stage = progress.stage === 'runtime' || progress.stage === 'model' || progress.stage === 'session' ? progress.stage : null
            setDetector({ loaded, total, stage })
          },
        })
        await handle.promise
        detectorSpawnedAt = detectorSpawn()
        detectorStatus = 'ready'
        inferWindow.clear() // the warm-up and the first frames should not set the p95
        setDetector({ status: 'ready', stage: null, error: null })
        panelStore.patch({ active: baselineActive() })
        announce(strings.announce.detectorReady)
        if (phase === 'still') void rerunStill()
      } catch (error) {
        detectorStatus = 'failed'
        const text = error instanceof Error ? error.message : 'unknown error'
        setDetector({ status: 'failed', stage: null, error: text })
        announce(strings.detector.failed(text))
      } finally {
        loadingDetector = null
      }
    })()
    return loadingDetector
  }

  // ---- "Show me the pipeline" ----

  /** Time one frame through the real path: the next one a live camera captures, or else one sent now. */
  async function timeOneFrame(fromCamera: boolean): Promise<PipelineTimings> {
    const trace = defer<PipelineTimings>()
    const timer = setTimeout(() => trace.reject(new Error('timeout')), TRACE_WAIT_MS)
    if (fromCamera && video) {
      pendingTrace?.reject(new Error('superseded'))
      pendingTrace = trace // the next frame the camera captures is timed
    } else {
      // No live source: send a frame through the real path anyway. The shown image if there is one, else the tone chart.
      void (async () => {
        try {
          let source: CanvasImageSource
          let sourceWidth = 320
          let sourceHeight = 240
          if (phase === 'still' && stillBitmap) {
            source = stillBitmap
            sourceWidth = stillBitmap.width
            sourceHeight = stillBitmap.height
          } else {
            const card = document.createElement('canvas')
            card.width = sourceWidth
            card.height = sourceHeight
            card.getContext('2d')?.putImageData(new ImageData(toneChart(sourceWidth, sourceHeight), sourceWidth, sourceHeight), 0, 0)
            source = card
          }
          enqueue(await grab(source, sourceWidth, sourceHeight, trace))
        } catch (error) {
          trace.reject(error)
        }
      })()
    }
    try {
      return await trace.promise
    } finally {
      clearTimeout(timer)
    }
  }

  async function requestTimedFrame(): Promise<PipelineTimings> {
    const fromCamera = phase === 'live' && video !== null
    try {
      return await timeOneFrame(fromCamera)
    } catch (error) {
      // The camera ended (Stop, Esc, scrolled away, a hidden tab) before it delivered the frame that was to be
      // timed. The button is below the viewfinder, so reaching it often ends the camera first. Time a frame sent
      // through the same path instead: still a real run, never a made-up one.
      if (fromCamera && error instanceof Error && error.message === 'stopped') return timeOneFrame(false)
      throw error
    }
  }

  /** Show a measured run on the panel: each schematic part lights as its stage is reported (all at once under lite motion). */
  async function reveal(steps: readonly PipelineStep[]) {
    let stages: PipelineStep['stages'] = []
    const annotations: Record<string, string> = {}
    for (const step of steps) {
      stages = [...stages, ...step.stages]
      if (step.annotation) annotations[step.node] = step.annotation
      if (lite) continue
      panelStore.patch({ stages, annotations: { ...annotations }, active: [step.node] })
      await sleep(REVEAL_DWELL_MS)
    }
    if (lite) panelStore.patch({ stages, annotations, active: [] })
  }

  async function runPipeline() {
    if (pipelineBusy || !canRun() || phase === 'starting' || phase === 'replay') return
    pipelineBusy = true
    panelStore.patch({ busy: true, stages: [], active: [], annotations: {} })
    ensureTick()
    try {
      prepare()
      const timings = await requestTimedFrame()
      await reveal(buildPipelineSteps(timings, formatMs))
      announce(strings.announce.pipelineDone)
    } catch (error) {
      if (error instanceof Error && error.message === 'dropped') store.patch({ message: { kind: 'frame-dropped' } })
      else announce(strings.announce.pipelineFailed)
    } finally {
      pipelineBusy = false
      panelStore.patch({ busy: false, active: baselineActive() })
    }
  }

  // ---- replay ----

  function startReplay(trace: TraceFile) {
    stopSource('user', true)
    stopMotion()
    resetMeasurements()
    const player = createTracePlayer(trace)
    const started = performance.now()
    phase = 'replay'
    store.patch({ phase: 'replay', source: 'replay', message: { kind: 'replay' }, width: trace.width, height: trace.height })
    paintIdle()
    frames.patch({ width: trace.width, height: trace.height })
    announce(strings.announce.replayStarted)
    const tick = () => {
      if (phase !== 'replay') return
      const t = performance.now() - started
      const reading = player.at(t)
      if (reading) {
        frames.patch({ seq: ++seq, width: trace.width, height: trace.height, boxes: reading.frame.boxes, detector: trace.detector })
        store.patch({
          depth: reading.frame.depth,
          droppedFrames: reading.frame.dropped,
          p95: reading.p95 === null ? null : round1(reading.p95),
          p95Kind: trace.detector ? 'infer' : 'pass',
          fps: reading.fps === null ? null : Math.round(reading.fps),
          frames: reading.index + 1,
          backpressure: reading.frame.depth >= BACKPRESSURE_DEPTH,
        })
      }
      if (t > player.duration + 800) {
        stopSource('user', true)
        store.patch({ message: { kind: 'idle' } })
        return
      }
      replayFrame = requestAnimationFrame(tick)
    }
    replayFrame = requestAnimationFrame(tick)
  }

  // ---- the worker ----

  function prepare() {
    if (prepared) return
    const { capability, reason } = probe()
    store.patch({ capability, capabilityReason: reason })
    if (capability !== 'ok') return
    prepared = true
    scheduler
      .ensureService('vision')
      .then(() => scheduler.submit('vision.warm', {}, { maxAttempts: 1 }).promise)
      .catch((error: unknown) => {
        // The worker cannot read frames (no OffscreenCanvas in workers, or no workers at all): say so and stop offering the demo.
        prepared = false
        const text = error instanceof Error ? error.message : 'The vision worker is not available'
        store.patch({ capability: 'unsupported', capabilityReason: text, message: { kind: 'worker-error', text } })
      })
  }

  // ---- the object ----

  return {
    store,
    frames,
    rack,
    attach(elements) {
      canvas = elements.canvas
      video = elements.video
      context = canvas.getContext('2d', { alpha: false })
      const { capability, reason } = probe()
      store.patch({ capability, capabilityReason: reason, record: { enabled: recordingEnabled, recording: false, count: recorder?.count ?? 0, full: false } })
      paintIdle()
      return () => {
        stopSource('unmount', true)
        stopMotion()
        canvas = null
        context = null
        video = null
        paintData = null
      }
    },
    palette: () => palette,
    setPalette(ink, paper) {
      palette = orderTones(ink, paper)
      tone += 1
      rack.patch({ tone })
      repaint()
    },
    setDisplayWidth(cssPx) {
      const next = Math.max(96, Math.min(CAPTURE_MAX, Math.floor(cssPx)))
      if (next === displayMax) return
      displayMax = next
      repaint()
    },
    setLite,
    setAvailability,
    prepare,
    startCamera,
    flipCamera,
    startClip,
    showImage,
    startReplay,
    stopReplay() {
      if (phase !== 'replay') return
      stopSource('user', true)
      store.patch({ message: { kind: 'idle' } })
    },
    stop: (reason) => stopSource(reason, false),
    startMotion,
    stopMotion,
    setSpeed(next) {
      speed = next
      store.patch({ speed: next })
    },
    loadDetector,
    runPipeline,
    startRecording() {
      if (!recorder) return
      const known = store.get()
      recorder.start({ width: known.width, height: known.height, detector: detectorStatus === 'ready' }, performance.now())
      syncRecord()
    },
    stopRecording() {
      recorder?.stop()
      syncRecord()
    },
    clearRecording() {
      recorder?.clear()
      syncRecord()
    },
    recordingJson: () => recorder?.toJson() ?? null,
  }
}
