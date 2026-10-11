// The vision worker (spec 6.7): letterbox, detect, suppress. The ONNX session lives ONLY here, in an
// on-origin module worker: the CSP spike (docs/CSP_SPIKE.md) showed that is where WebAssembly may compile.
//
//   'vision.warm'      -> { ok: true }         checks the worker can read frames, allocates the buffers
//   'vision.loadModel' -> { bytes }            streams the runtime and the model with progress, creates the session
//   'vision.detect'    -> DetectResultX        letterbox to 320 x 320, run, decode, NMS (IoU 0.45, conf 0.25, max 50)
//   'vision.motion'    -> { ts }               the zero-cost job the DeviceMotion producer feeds the same queue with
//
// `onnxruntime-web` stays behind a dynamic import inside 'vision.loadModel', so booting this worker costs a
// few KB; the runtime (about 15 KB of JavaScript, 14 MB of WebAssembly) is only fetched on a tap.
//
// Without a model the worker still does everything up to the session: it letterboxes the frame and fills the
// input tensor (the real first half of the pipeline) and answers `detector: false`, so the panel can show
// real queue behaviour and never mistakes "no detector" for "a very fast detector".
import type { InferenceSession } from 'onnxruntime-web/wasm'
import type { JobPayload } from '../cluster/protocol.ts'
import { COCO_CLASSES } from '../lib/vision/coco-classes.ts'
import { detectionsFromOutput } from '../lib/vision/decode.ts'
import { INPUT_SIZE, PAD_GREY, letterbox } from '../lib/vision/letterbox.ts'
import { rgbaToPlanar, tensorLength } from '../lib/vision/tensor.ts'
import type { DetectResultX, LoadPayloadX } from '../lib/vision/types.ts'
import { defineWorker, RetryableError, type JobContext } from './_base.ts'

type Ort = typeof import('onnxruntime-web/wasm')

/** Milliseconds since `since`, to a tenth. */
const elapsed = (since: number) => Math.round((performance.now() - since) * 10) / 10

// ---- frame surface: where a frame is letterboxed ---------------------------------------------------

interface Surface {
  context: OffscreenCanvasRenderingContext2D
  tensor: Float32Array
}

let surface: Surface | null = null

/** The reusable 320 x 320 canvas and tensor buffer. Throws a plain sentence when the browser cannot do this in a worker. */
function ensureSurface(): Surface {
  if (surface) return surface
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('This browser cannot read camera frames inside a worker (OffscreenCanvas is missing).')
  }
  const canvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('This browser would not give the worker a 2D canvas.')
  surface = { context, tensor: new Float32Array(tensorLength(INPUT_SIZE)) }
  return surface
}

// ---- the detector ----------------------------------------------------------------------------------

interface Detector {
  ort: Ort
  session: InferenceSession
  input: string
  output: string
  names: readonly string[]
}

let detector: Detector | null = null
let loading: Promise<number> | null = null
let ortModule: Promise<Ort> | null = null

/**
 * Stream a same-origin file into memory, reporting bytes as they arrive. A dropped connection or a 5xx is
 * worth retrying; a 404 is not (the file is not there), so it fails at once with a plain message.
 */
async function fetchBytes(url: string, onBytes: (loaded: number) => void, signal: AbortSignal): Promise<Uint8Array> {
  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (error) {
    if (signal.aborted) throw error
    throw new RetryableError(`Could not reach ${url}`)
  }
  if (!response.ok) {
    const message = `${url} answered ${response.status}`
    if (response.status >= 500) throw new RetryableError(message)
    throw new Error(response.status === 404 ? `${url} is not published (404)` : message)
  }
  const reader = response.body?.getReader()
  if (!reader) {
    const all = new Uint8Array(await response.arrayBuffer())
    onBytes(all.length)
    return all
  }
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    let step: ReadableStreamReadResult<Uint8Array>
    try {
      step = await reader.read()
    } catch (error) {
      if (signal.aborted) throw error
      throw new RetryableError(`The connection to ${url} dropped`)
    }
    if (step.done) break
    chunks.push(step.value)
    loaded += step.value.length
    onBytes(loaded)
  }
  const all = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    all.set(chunk, offset)
    offset += chunk.length
  }
  return all
}

async function importOrt(): Promise<Ort> {
  ortModule ??= import('onnxruntime-web/wasm')
  try {
    return await ortModule
  } catch {
    ortModule = null
    throw new RetryableError('Could not load the ONNX Runtime script')
  }
}

async function loadDetector(payload: LoadPayloadX, ctx: JobContext): Promise<number> {
  if (payload.inputSize !== INPUT_SIZE) throw new Error(`This worker is built for ${INPUT_SIZE} px input, not ${String(payload.inputSize)}`)
  ensureSurface()

  const wasmBase = payload.wasmBase.endsWith('/') ? payload.wasmBase : `${payload.wasmBase}/`
  const wasmUrl = `${wasmBase}ort-wasm-simd-threaded.wasm`
  // Both sizes come from the build, so the bar is a true fraction; if either is unknown the total is 0 (indeterminate).
  const total = payload.wasmBytes && payload.modelBytes ? payload.wasmBytes + payload.modelBytes : 0

  // At most ten progress messages a second: the whole download is thousands of chunks.
  let lastReport = 0
  const report = (stage: string, loaded: number, force = false) => {
    const now = performance.now()
    if (!force && now - lastReport < 100) return
    lastReport = now
    ctx.progress({ stage, bytesLoaded: loaded, bytesTotal: total })
  }

  report('runtime', 0, true)
  const ort = await importOrt()
  // Fetch the WebAssembly ourselves so its bytes can be counted; ORT then uses this buffer and never fetches it.
  const wasm = await fetchBytes(wasmUrl, (loaded) => report('runtime', loaded), ctx.signal)
  report('runtime', wasm.length, true)
  const model = await fetchBytes(payload.modelUrl, (loaded) => report('model', wasm.length + loaded), ctx.signal)
  report('model', wasm.length + model.length, true)

  // Single-threaded, plain WebAssembly: the site has no cross-origin isolation, so there is no SharedArrayBuffer.
  ort.env.wasm.numThreads = 1
  ort.env.wasm.simd = true
  ort.env.wasm.proxy = false
  // Absolute URLs on purpose. ORT loads its glue script with a dynamic `import(url)`; the Vite dev server
  // rewrites a root-relative one to `/ort/x.mjs?import` and then refuses it (files in public/ are not
  // transformed). A fully qualified URL is left alone, in dev and in the production build alike.
  const origin = self.location.origin
  ort.env.wasm.wasmPaths = { mjs: `${origin}${wasmBase}ort-wasm-simd-threaded.mjs`, wasm: `${origin}${wasmBase}ort-wasm-simd-threaded.wasm` }
  ort.env.wasm.wasmBinary = wasm

  ctx.progress({ stage: 'session', bytesLoaded: wasm.length + model.length, bytesTotal: total })
  let session: InferenceSession
  try {
    session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
  } finally {
    // The runtime has copied what it needs; do not keep 14 MB alive on the global settings object.
    ort.env.wasm.wasmBinary = undefined
  }
  const input = session.inputNames[0]
  const output = session.outputNames[0]
  const inputMeta = session.inputMetadata[0]
  if (inputMeta?.isTensor && inputMeta.type !== 'float32') {
    throw new Error(`The detector takes ${inputMeta.type} input; it must take float32 (see public/models/yolov8n/README.md)`)
  }

  // One throw-away run on a blank frame compiles the kernels now, so the first real frame is not the slow one.
  const blank = new ort.Tensor('float32', new Float32Array(tensorLength(INPUT_SIZE)), [1, 3, INPUT_SIZE, INPUT_SIZE])
  const warmed = await session.run({ [input]: blank })
  for (const value of Object.values(warmed)) value.dispose()

  detector = { ort, session, input, output, names: payload.classes ?? COCO_CLASSES }
  return wasm.length + model.length
}

// ---- detecting ---------------------------------------------------------------------------------------

/** Detect jobs run one at a time: they share one canvas and one tensor buffer. */
let tail: Promise<unknown> = Promise.resolve()
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const run = tail.then(work, work)
  tail = run.catch(() => undefined)
  return run
}

async function detect({ bitmap, ts }: JobPayload['vision.detect']): Promise<DetectResultX> {
  const { context, tensor } = ensureSurface()
  const sourceWidth = bitmap.width
  const sourceHeight = bitmap.height
  if (sourceWidth === 0 || sourceHeight === 0) throw new Error('The frame arrived empty')

  const preStart = performance.now()
  const box = letterbox(sourceWidth, sourceHeight, INPUT_SIZE)
  context.fillStyle = `rgb(${PAD_GREY} ${PAD_GREY} ${PAD_GREY})`
  context.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE)
  context.drawImage(bitmap, box.padX, box.padY, box.width, box.height)
  bitmap.close() // the frame was transferred to this worker; release it as soon as it is on the canvas
  rgbaToPlanar(context.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data, INPUT_SIZE, tensor)
  const preMs = elapsed(preStart)

  if (!detector) return { boxes: [], inferMs: 0, ts, detector: false, preMs, postMs: 0 }

  const { ort, session, input, output, names } = detector
  const inferStart = performance.now()
  const outputs = await session.run({ [input]: new ort.Tensor('float32', tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]) })
  const inferMs = elapsed(inferStart)

  const postStart = performance.now()
  const head = outputs[output]
  const boxes = detectionsFromOutput(head.data as Float32Array, head.dims, box, sourceWidth, sourceHeight, names)
  for (const value of Object.values(outputs)) value.dispose()
  return { boxes, inferMs, ts, detector: true, preMs, postMs: elapsed(postStart) }
}

defineWorker('vision-a', {
  'vision.warm': () => {
    ensureSurface()
    return { ok: true }
  },

  'vision.loadModel': (payload, ctx) => {
    if (detector) return { bytes: 0 } // already loaded: nothing was fetched
    // A second request while the first is still downloading joins it instead of downloading twice.
    loading ??= loadDetector(payload as LoadPayloadX, ctx).finally(() => {
      loading = null
    })
    return loading.then((bytes) => ({ bytes }))
  },

  'vision.detect': (payload) => serialize(() => detect(payload)),

  'vision.motion': ({ ts }) => ({ ts }),
})
