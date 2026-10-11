// The retrieval service: one worker node (`retrieval-a`) that holds the index over this site's own text and
// answers questions with cited passages. Spec 6.6 and 4.3.
//
//   retrieval.warm       fetch /retrieval/corpus.json, build the BM25 index          -> { chunks, terms, ... }
//   retrieval.search     the five stages (tokenize, embed or BM25, score, rerank, cite) -> { hits, stages, ... }
//   retrieval.loadModel  tier 1, on a tap only: stream the MiniLM encoder and the ONNX Runtime WASM with
//                        progress, create the session HERE (the CSP lets on-origin module workers compile WASM,
//                        the main thread cannot), then take the build-time vectors of the page's elements from
//                        embeddings.json and embed whatever they do not cover        -> { bytes, dim, chunksEmbedded, ... }
//                        (`chunksEmbedded` and `chunksPrecomputed` count page elements: units.ts)
//
// The ONNX Runtime import is dynamic, so the 15 KB of runtime glue is a separate chunk that only a tap fetches;
// the worker itself is a few KB. Everything model-shaped lives in src/lib/retrieval/ (shared with the build).
import type { JobContext } from './_base.ts'
import { RetryableError, defineWorker } from './_base.ts'
import type { Corpus } from '../lib/retrieval/corpus.ts'
import { RetrievalEngine } from '../lib/retrieval/engine.ts'
import { createEncoder, PARITY_SENTENCES, readEmbeddings, type OrtLike, type OrtSessionLike } from '../lib/retrieval/embed.ts'
import { encodeFloat32 } from '../lib/retrieval/cosine.ts'
import type { LoadModelResult, LoadStage, SearchResult, WarmResult } from '../lib/retrieval/types.ts'
import { parseVocab } from '../lib/retrieval/wordpiece.ts'

const DEFAULT_CORPUS_URL = '/retrieval/corpus.json'
/** Progress messages from downloads are limited to this rate: each one is a real message the board's relay throws on. */
const PROGRESS_EVERY_MS = 100

interface Warm {
  engine: RetrievalEngine
  info: WarmResult
}

let corpusUrl = DEFAULT_CORPUS_URL
let warm: Warm | null = null
let warming: Promise<Warm> | null = null
let loading: Promise<LoadModelResult> | null = null
let loaded: LoadModelResult | null = null

const now = () => performance.now()
const round1 = (n: number) => Math.round(n * 10) / 10

// ---- warm ---------------------------------------------------------------------------------------------------

async function fetchCorpus(url: string): Promise<{ corpus: Corpus; bytes: number; ms: number }> {
  const started = now()
  let response: Response
  try {
    // `no-cache`: always ask the server, which answers 304 when nothing changed. A stale corpus would still
    // work, but citations would point at text that has since been edited.
    response = await fetch(url, { cache: 'no-cache' })
  } catch (error) {
    throw new RetryableError(`Could not reach ${url}: ${error instanceof Error ? error.message : 'network error'}`)
  }
  if (response.status >= 500) throw new RetryableError(`${url} answered ${response.status}`)
  if (!response.ok) throw new Error(`${url} answered ${response.status}: the corpus was not published`)
  const text = await response.text()
  let corpus: Corpus
  try {
    corpus = JSON.parse(text) as Corpus
  } catch {
    // The dev server answers an unknown path with index.html: not JSON, and not worth retrying.
    throw new Error(`${url} is not the retrieval corpus (run "node scripts/build-corpus.ts")`)
  }
  if (!Array.isArray(corpus.chunks) || !Array.isArray(corpus.sections)) throw new Error(`${url} is not a retrieval corpus`)
  return { corpus, bytes: new TextEncoder().encode(text).length, ms: round1(now() - started) }
}

function warmUp(url: string): Promise<Warm> {
  if (warm && url === corpusUrl) return Promise.resolve(warm)
  if (warming && url === corpusUrl) return warming
  corpusUrl = url
  const promise = (async (): Promise<Warm> => {
    const { corpus, bytes, ms } = await fetchCorpus(url)
    const engine = new RetrievalEngine(corpus)
    const info: WarmResult = {
      chunks: engine.stats.chunks,
      terms: engine.stats.terms,
      avgLen: round1(engine.stats.avgLen),
      sections: engine.stats.sections,
      fetchMs: ms,
      indexMs: engine.stats.buildMs,
      corpusBytes: bytes,
      tokenizer: corpus.tokenizer ?? 'wordpiece',
      assets: {
        vocab: corpus.assets?.vocab ? { path: corpus.assets.vocab.path, bytes: corpus.assets.vocab.bytes } : null,
        encoder: corpus.assets?.encoder ?? null,
        runtime: corpus.assets?.runtime ?? null,
      },
    }
    warm = { engine, info }
    return warm
  })()
  warming = promise
  // A failed warm must not stick: the next job tries again.
  promise.catch(() => {
    if (warming === promise) warming = null
  })
  return promise
}

// ---- the model ----------------------------------------------------------------------------------------------

interface Download {
  bytes: Uint8Array
  /** Bytes that actually crossed the network (small when the browser's cache answered). Undefined when the browser does not say. */
  transferred: number | undefined
  ms: number
}

/** Fetch a file, reporting progress at most every PROGRESS_EVERY_MS. `expected` backs up a missing or compressed Content-Length. */
async function download(url: string, stage: LoadStage, expected: number | undefined, ctx: JobContext): Promise<Download> {
  const started = now()
  const response = await fetch(url, { signal: ctx.signal })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  const header = Number(response.headers.get('content-length')) || 0
  const total = expected ?? header
  const reader = response.body?.getReader()
  let bytes: Uint8Array
  if (!reader) {
    bytes = new Uint8Array(await response.arrayBuffer())
    ctx.progress({ stage, bytesLoaded: bytes.length, bytesTotal: bytes.length })
  } else {
    const parts: Uint8Array[] = []
    let loadedBytes = 0
    let last = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value)
      loadedBytes += value.length
      if (now() - last >= PROGRESS_EVERY_MS) {
        last = now()
        ctx.progress({ stage, bytesLoaded: loadedBytes, bytesTotal: Math.max(total, loadedBytes) })
      }
    }
    bytes = new Uint8Array(loadedBytes)
    let at = 0
    for (const part of parts) {
      bytes.set(part, at)
      at += part.length
    }
    ctx.progress({ stage, bytesLoaded: loadedBytes, bytesTotal: Math.max(total, loadedBytes) })
  }
  const ms = round1(now() - started)
  return { bytes, transferred: await transferSizeOf(response.url), ms }
}

/**
 * How many bytes crossed the network for `url`, from Resource Timing (a few hundred when the browser's cache
 * answered). The entry is added a moment after the body has been read, so look a few times before giving up;
 * undefined when the browser does not say.
 */
async function transferSizeOf(url: string): Promise<number | undefined> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const entry = performance.getEntriesByName(url).at(-1) as PerformanceResourceTiming | undefined
      if (entry && typeof entry.transferSize === 'number') return entry.transferSize
    } catch {
      return undefined // Resource Timing is not available in this worker
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return undefined
}

async function loadModel(modelUrl: string, wasmBase: string, embeddingsUrl: string | undefined, ctx: JobContext): Promise<LoadModelResult> {
  const started = now()
  const { engine, info } = await warmUp(corpusUrl)
  if (info.tokenizer !== 'wordpiece') {
    throw new Error('The corpus was cut without the WordPiece vocabulary, so it cannot be embedded: add public/models/minilm/vocab.txt and rebuild.')
  }
  // An absolute URL on purpose. ONNX Runtime does `import(wasmPaths + 'ort-wasm-simd-threaded.mjs')`, and `vite dev`
  // adds `?import` to a dynamic import whose path starts with "/", which it then refuses for a file in public/.
  // An absolute URL is left alone (and in production it is the same file, on the same origin).
  const base = new URL(wasmBase.endsWith('/') ? wasmBase : `${wasmBase}/`, self.location.href).href
  const vocabUrl = new URL('vocab.txt', new URL(modelUrl, self.location.href)).href

  // 1. the vocabulary (the encoder's tokenizer needs it)
  const vocabFile = await download(vocabUrl, 'vocabulary', info.assets.vocab?.bytes, ctx)
  const vocab = parseVocab(new TextDecoder().decode(vocabFile.bytes))

  // 2. the model, 3. the runtime. Fetched here, not by ORT, so each one reports real progress.
  const model = await download(modelUrl, 'model', info.assets.encoder?.bytes, ctx)
  const runtime = await download(`${base}ort-wasm-simd-threaded.wasm`, 'runtime', info.assets.runtime?.bytes, ctx)

  // 4. the session, in this on-origin module worker (the main thread would be refused WASM by the CSP).
  ctx.progress({ stage: 'session' })
  const sessionStarted = now()
  let session: OrtSessionLike
  let ort: OrtLike
  try {
    const module = await import('onnxruntime-web/wasm')
    module.env.wasm.numThreads = 1 // no SharedArrayBuffer on GitHub Pages (no COOP/COEP): one thread, always
    module.env.wasm.simd = true
    module.env.wasm.wasmPaths = base // the small JS loader still comes from /ort/
    module.env.wasm.wasmBinary = runtime.bytes // the WASM itself is the bytes just read, so it is fetched once
    const created = await module.InferenceSession.create(model.bytes, { executionProviders: ['wasm'] })
    module.env.wasm.wasmBinary = undefined // let the 14 MB go
    session = created as unknown as OrtSessionLike
    ort = module as unknown as OrtLike
  } catch (error) {
    // ONNX Runtime keeps a failed start for the life of the worker, so the panel restarts the node before a retry.
    throw new Error(`[session] ${error instanceof Error ? error.message : 'could not create the ONNX session'}`, { cause: error })
  }
  const encoder = createEncoder(ort, session, vocab)
  const sessionMs = round1(now() - sessionStarted)

  // 5. the vectors of the page's elements (units.ts): the build's embeddings.json where it still matches, the rest computed here
  const embeddingsStarted = now()
  const inputs = engine.inputs()
  let precomputed: unknown = null
  if (embeddingsUrl) {
    try {
      const response = await fetch(embeddingsUrl, { signal: ctx.signal })
      if (response.ok && !(response.headers.get('content-type') ?? '').includes('text/html')) precomputed = await response.json()
    } catch (error) {
      if (ctx.signal.aborted) throw error
      /* no precomputed file: everything is embedded below */
    }
  }
  const read = readEmbeddings(precomputed, inputs, null)
  const vectors = read.vectors.slice()
  const missing = vectors.flatMap((vector, i) => (vector === null ? [i] : []))
  if (missing.length > 0) {
    ctx.progress({ stage: 'embeddings', pct: 0 })
    const made = await encoder.encode(
      missing.map((i) => inputs[i].input),
      { signal: ctx.signal, onProgress: (done, total) => ctx.progress({ stage: 'embeddings', pct: Math.round((done / total) * 100) }) },
    )
    missing.forEach((chunk, at) => {
      vectors[chunk] = made[at]
    })
  }
  const complete = vectors.filter((vector): vector is Float32Array => vector !== null)
  if (complete.length !== vectors.length) throw new Error('Some page elements have no embedding')
  engine.attachEncoder(encoder, complete)
  // Five fixed sentences through the same path: the parity fixture is made from these (see embed.ts).
  const parity = (await encoder.encode(PARITY_SENTENCES, { signal: ctx.signal })).map((vector) => encodeFloat32(vector))

  const result: LoadModelResult = {
    bytes: vocabFile.bytes.length + model.bytes.length + runtime.bytes.length,
    dim: encoder.dim ?? complete[0]?.length ?? 0,
    chunksEmbedded: missing.length,
    chunksPrecomputed: read.reused,
    modelBytes: model.bytes.length,
    runtimeBytes: runtime.bytes.length,
    parity,
    timings: {
      model: model.ms,
      runtime: runtime.ms,
      session: sessionMs,
      embeddings: round1(now() - embeddingsStarted),
      total: round1(now() - started),
    },
  }
  if (vocabFile.transferred !== undefined && model.transferred !== undefined && runtime.transferred !== undefined) {
    result.transferred = vocabFile.transferred + model.transferred + runtime.transferred
  }
  return result
}

// ---- the node -----------------------------------------------------------------------------------------------

defineWorker('retrieval-a', {
  'retrieval.warm': async (payload, ctx) => {
    ctx.progress({ stage: 'corpus', pct: 0 })
    const { info } = await warmUp(payload.corpusUrl || DEFAULT_CORPUS_URL)
    ctx.progress({ stage: 'index', pct: 100 })
    return info
  },

  'retrieval.search': async (payload, ctx) => {
    const cold = warm === null
    const started = now()
    const { engine } = await warmUp(corpusUrl)
    const coldStartMs = cold ? round1(now() - started) : undefined
    let done = 0
    const result: SearchResult = await engine.search(payload.query, {
      mode: payload.mode,
      topK: payload.topK,
      onStage: (stage) => ctx.progress({ stage: stage.name, pct: Math.round((++done / 5) * 100) }),
    })
    if (coldStartMs !== undefined) result.coldStartMs = coldStartMs
    return result
  },

  'retrieval.loadModel': async (payload, ctx) => {
    if (loaded) return loaded
    // One load at a time: a second tap while the first is running joins it.
    loading ??= loadModel(payload.modelUrl, payload.wasmBase, payload.embeddingsUrl, ctx).then(
      (result) => {
        loaded = result
        return result
      },
      (error: unknown) => {
        loading = null
        throw error
      },
    )
    return loading
  },
})
