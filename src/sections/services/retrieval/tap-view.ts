/**
 * The model tap's view logic: how far along "load the embedding model" is (computed from the worker's real
 * progress messages), and where the keyboard goes when the button that was pressed is replaced.
 *
 * The load has three downloads (the vocabulary, the encoder, the ONNX Runtime WASM), then two steps with no
 * byte count (starting the session, embedding the page). The bar is one bar over the downloads, measured in
 * bytes against the sizes this build ships (they are in corpus.json, measured from the files on disk), then it
 * turns into a hatched "working" bar for the session and into a percentage for the page.
 *
 * Pure and DOM-free.
 */
import { formatBytes } from '../../../cluster/format.ts'
import type { LoadStage } from '../../../lib/retrieval/types.ts'

/** The states the tap is in (ModelTap.tsx draws each one). */
export type TapKind = 'unavailable' | 'idle' | 'loading' | 'ready' | 'error'

/** The control the keyboard lands on: the Stop button, the Load button, or the chosen engine's radio. */
export type TapFocus = 'stop' | 'load' | 'engine'

/**
 * Pressing Load removes the Load button (Stop takes its place), pressing Stop or a finished download removes
 * Stop, and a removed button takes the keyboard's place with it: the next Tab would start again from the top
 * of the page. So the tap hands the focus to the control that replaces it. A state that offers nothing to
 * press (the model is unavailable) hands it to nothing.
 */
export function focusAfter(kind: TapKind): TapFocus | null {
  if (kind === 'loading') return 'stop'
  if (kind === 'ready') return 'engine'
  if (kind === 'idle' || kind === 'error') return 'load'
  return null
}

export type DownloadStage = 'vocabulary' | 'model' | 'runtime'
const DOWNLOADS: readonly DownloadStage[] = ['vocabulary', 'model', 'runtime']

/** Sizes of the three files, bytes, as this build ships them (null when unknown). */
export type ExpectedSizes = Record<DownloadStage, number | null>

export interface TapProgress {
  /** The step the worker is on. */
  stage: LoadStage
  /** Bytes read so far, per download. */
  files: Partial<Record<DownloadStage, { loaded: number; total: number }>>
  /** 0 to 100 while the page is being embedded here, otherwise null. */
  pct: number | null
}

export const TAP_START: TapProgress = { stage: 'vocabulary', files: {}, pct: null }

/** One progress message from the worker (`ModelProgress` in client.ts). */
export interface ProgressEvent {
  stage: LoadStage
  loaded: number
  total: number
  pct?: number
}

const isDownload = (stage: LoadStage): stage is DownloadStage => (DOWNLOADS as readonly string[]).includes(stage)

export function reduceProgress(previous: TapProgress, event: ProgressEvent): TapProgress {
  if (isDownload(event.stage)) {
    return { ...previous, stage: event.stage, files: { ...previous.files, [event.stage]: { loaded: event.loaded, total: Math.max(event.total, event.loaded) } } }
  }
  return { ...previous, stage: event.stage, pct: event.pct === undefined ? previous.pct : Math.max(0, Math.min(100, event.pct)) }
}

export interface ProgressView {
  /** 0 to 1, or null while the amount is not known (the bar is hatched). */
  fraction: number | null
  /** The measured amount in words: `14.30 MB of 37.47 MB`, `61%`. */
  detail: string
}

export function describeProgress(progress: TapProgress, expected: ExpectedSizes): ProgressView {
  let loaded = 0
  let total = 0
  let unknown = false
  for (const stage of DOWNLOADS) {
    const file = progress.files[stage]
    const size = file?.total ?? expected[stage]
    if (size === null || size === undefined) unknown = true
    else total += size
    loaded += file?.loaded ?? 0
  }
  total = Math.max(total, loaded)

  if (progress.stage === 'embeddings') {
    const pct = progress.pct ?? 0
    return { fraction: pct / 100, detail: `${Math.round(pct)}%` }
  }
  if (progress.stage === 'session') {
    return { fraction: null, detail: loaded > 0 ? `${formatBytes(loaded)} read` : '' }
  }
  if (unknown || total === 0) return { fraction: null, detail: loaded > 0 ? formatBytes(loaded) : '' }
  return { fraction: Math.min(1, loaded / total), detail: `${formatBytes(loaded)} of ${formatBytes(total)}` }
}
