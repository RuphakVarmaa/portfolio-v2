/**
 * How the retrieval demo talks to its service: jobs on the cluster's scheduler (`retrieval.warm`,
 * `retrieval.search`, `retrieval.loadModel`), with the one honest fallback this port has: if the browser has
 * no Web Workers, BM25 runs on the main thread (same code, same index) and the panel says so. The embedding
 * model never does: ONNX Runtime may only start inside an on-origin module worker (docs/CSP_SPIKE.md).
 *
 * No React in this file.
 */
import type { JobHandle } from '../../../cluster/scheduler.ts'
import { scheduler } from '../../../cluster/scheduler.ts'
import { telemetry } from '../../../cluster/telemetry.ts'
import type { LoadModelResult, LoadStage, RetrievalMode, SearchResult, WarmResult } from '../../../lib/retrieval/types.ts'

export const CORPUS_URL = '/retrieval/corpus.json'
export const MODEL_URL = '/models/minilm/model_quantized.onnx'
export const WASM_BASE = '/ort/'
export const EMBEDDINGS_URL = '/retrieval/embeddings.json'
/** Passages shown per question. */
export const TOP_K = 5

export type Where = 'worker' | 'main'

/** A worker that cannot start at all (as opposed to a job that failed): the signal to use the main thread instead. */
function workersUnavailable(error: unknown): boolean {
  return error instanceof Error && /not available/i.test(error.message)
}

// ---- the main-thread fallback -----------------------------------------------------------------------------

interface Local {
  engine: import('../../../lib/retrieval/engine.ts').RetrievalEngine
  info: WarmResult
}
let local: Promise<Local> | null = null

function localEngine(): Promise<Local> {
  local ??= (async () => {
    const started = performance.now()
    const response = await fetch(CORPUS_URL, { cache: 'no-cache' })
    if (!response.ok) throw new Error(`${CORPUS_URL} answered ${response.status}: the corpus was not published`)
    const text = await response.text()
    let corpus: import('../../../lib/retrieval/corpus.ts').Corpus
    try {
      corpus = JSON.parse(text)
    } catch {
      throw new Error(`${CORPUS_URL} is not the retrieval corpus (run "node scripts/build-corpus.ts")`)
    }
    const fetchMs = Math.round((performance.now() - started) * 10) / 10
    const { RetrievalEngine } = await import('../../../lib/retrieval/engine.ts')
    const engine = new RetrievalEngine(corpus)
    return {
      engine,
      info: {
        chunks: engine.stats.chunks,
        terms: engine.stats.terms,
        avgLen: Math.round(engine.stats.avgLen * 10) / 10,
        sections: engine.stats.sections,
        fetchMs,
        indexMs: engine.stats.buildMs,
        corpusBytes: new TextEncoder().encode(text).length,
        tokenizer: corpus.tokenizer ?? 'wordpiece',
        assets: {
          vocab: corpus.assets?.vocab ?? null,
          encoder: corpus.assets?.encoder ?? null,
          runtime: corpus.assets?.runtime ?? null,
        },
      },
    }
  })()
  // A failed fetch must not stick.
  local.catch(() => {
    local = null
  })
  return local
}

// ---- warm and search -------------------------------------------------------------------------------------------

/** Fetch the corpus and build the index (in the retrieval worker, or on the main thread without workers). */
export async function warm(): Promise<{ info: WarmResult; where: Where }> {
  if (scheduler.isSupported()) {
    try {
      const info = (await scheduler.submit('retrieval.warm', { corpusUrl: CORPUS_URL }).promise) as WarmResult
      return { info, where: 'worker' }
    } catch (error) {
      if (!workersUnavailable(error)) throw error
    }
  }
  return { info: (await localEngine()).info, where: 'main' }
}

export interface SearchRun {
  result: SearchResult
  /** ms from submitting the job to having the answer, measured on the main thread. */
  roundTripMs: number
  where: Where
}

/** One question, through the five stages. `onStage` is called with each stage name as the worker reports it. */
export async function search(query: string, mode: RetrievalMode, onStage?: (stage: string) => void): Promise<SearchRun> {
  const started = performance.now()
  if (scheduler.isSupported()) {
    try {
      const handle = scheduler.submit('retrieval.search', { query, mode, topK: TOP_K }, { onProgress: (p) => p.stage && onStage?.(p.stage) })
      const result = (await handle.promise) as SearchResult
      return { result, roundTripMs: Math.round((performance.now() - started) * 10) / 10, where: 'worker' }
    } catch (error) {
      if (!workersUnavailable(error)) throw error
    }
  }
  if (mode === 'embed') throw new Error('The embedding model needs a Web Worker.')
  const { engine } = await localEngine()
  const result = await engine.search(query, { mode, topK: TOP_K, onStage: (stage) => onStage?.(stage.name) })
  return { result, roundTripMs: Math.round((performance.now() - started) * 10) / 10, where: 'main' }
}

// ---- the model (tier 1) ----------------------------------------------------------------------------------------

export interface ModelProgress {
  stage: LoadStage
  loaded: number
  total: number
  /** 0 to 100 for the stages that are not downloads (embedding the page). */
  pct?: number
}

/**
 * Start the tap's job: the vocabulary, the encoder and the ONNX Runtime WASM streamed with progress, the session
 * created in the worker, the page embedded (or the build's vectors read). Bytes go to telemetry as they arrive.
 * Never retried automatically: a failed 37 MB download is the visitor's to repeat.
 */
export function loadModel(onProgress: (progress: ModelProgress) => void): JobHandle<'retrieval.loadModel'> {
  const loaded = new Map<string, { loaded: number; total: number }>()
  return scheduler.submit(
    'retrieval.loadModel',
    { modelUrl: MODEL_URL, wasmBase: WASM_BASE, embeddingsUrl: EMBEDDINGS_URL },
    {
      maxAttempts: 1,
      onProgress: (p) => {
        const stage = p.stage as LoadStage | undefined
        if (!stage) return
        if (p.bytesLoaded !== undefined) {
          loaded.set(stage, { loaded: p.bytesLoaded, total: p.bytesTotal ?? p.bytesLoaded })
          let sumLoaded = 0
          let sumTotal = 0
          for (const entry of loaded.values()) {
            sumLoaded += entry.loaded
            sumTotal += entry.total
          }
          telemetry.recordModelBytes('retrieval', sumLoaded, sumTotal)
          onProgress({ stage, loaded: p.bytesLoaded, total: p.bytesTotal ?? p.bytesLoaded })
        } else {
          onProgress({ stage, loaded: 0, total: 0, ...(p.pct === undefined ? {} : { pct: p.pct }) })
        }
      },
    },
  )
}

/**
 * Terminate and respawn the retrieval worker (what the tap does before a retry that follows a failed session
 * start: ONNX Runtime keeps a failed start for the life of its worker). `scheduler.restart` is the quiet way to
 * do it: the same `Worker.terminate()` and respawn as pulling the plug, without the "unplugged" sentence.
 */
export async function restartWorker(): Promise<void> {
  scheduler.restart('retrieval', 0)
  await scheduler.ensureService('retrieval')
}

export function workerAvailable(): boolean {
  return scheduler.isSupported()
}

export type { LoadModelResult }
