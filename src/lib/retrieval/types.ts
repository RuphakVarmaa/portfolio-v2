/**
 * What the retrieval worker sends back, beyond the frozen protocol types (src/cluster/protocol.ts).
 *
 * The protocol's `Hit` is `{ chunkId, anchor, text, bm25, cosine?, window }` and `JobResult` fixes the shape
 * of every job's result. Structured clone carries extra properties, so the worker returns richer objects
 * that still satisfy those types (`RichHit extends Hit`, `SearchResult` has `hits` and `stages` first), and
 * this file names the extras so the panel can read them without a cast to `any`. Anything that only knows
 * the protocol (the /experiments/ explorer, for one) keeps working on the base fields.
 *
 * Types only: erased at build, safe to import anywhere.
 */
import type { Hit, Stage } from '../../cluster/protocol.ts'
import type { CorpusPart, CorpusSection, PartDepth, PartKind, TextRange } from './corpus.ts'

export type RetrievalMode = 'bm25' | 'embed'

/** The sentence inside a hit's `text` that best answers the question: what the citation points at. */
export interface Evidence {
  /** Character range in `Hit.text`. */
  from: number
  to: number
  /** Index into `RichHit.parts` of the page element the sentence belongs to. */
  part: number
}

/** Where a hit's window sits in its section, for the window miniature. */
export interface SectionWindows {
  id: string
  title: string
  /** Tokens in the whole section. */
  tokens: number
  /** Every window of the section, in order, as token offsets. */
  windows: Array<{ start: number; end: number }>
  /** Which of `windows` this hit is. */
  index: number
}

export interface RichHit extends Hit {
  /** 1 = best. */
  rank: number
  /** Embedding mode only: the cosine of the window's nearest page element to the question (units.ts). */
  cosine?: number
  mode: RetrievalMode
  /** Tokens in the window. */
  tokens: number
  /** The page elements this window was cut from. */
  parts: CorpusPart[]
  /**
   * The stretch of `text` a card shows, when it is not all of it: the window without the broken ends of words that a
   * wordpiece cut left at its edges (`CorpusChunk.shown`). `text`, `window` and the offsets in `parts` and `evidence` are the window's own.
   */
  shown?: TextRange
  evidence: Evidence | null
  /** The question's words (as typed) that this window matched, by their stems. */
  matched: string[]
  /** How many distinct words the question had after stop words. */
  asked: number
  /** What each matched word added to the BM25 score, largest first. */
  contributions: Array<{ word: string; score: number }>
  /** The section heading words BM25 indexes with every window of the section. */
  context: string
  section: SectionWindows
}

export interface SearchResult {
  hits: RichHit[]
  stages: Stage[]
  mode: RetrievalMode
  /** The words BM25 searched for (after stop words), as typed. */
  words: string[]
  /** Candidates above the relevance floor, before the top K was cut. */
  candidates: number
  /** What the rerank stage did, in a few words. */
  rerank: string
  /** Sum of the stage timings, ms. */
  totalMs: number
  /** Set when this search had to fetch and index the corpus first (a fresh or respawned worker): ms that took. */
  coldStartMs?: number
}

export interface WarmResult {
  chunks: number
  terms: number
  /** Mean chunk length in indexed terms. */
  avgLen: number
  /** Sections in the corpus. */
  sections: number
  /** ms to fetch, parse and index the corpus inside the worker. */
  fetchMs: number
  indexMs: number
  corpusBytes: number
  tokenizer: 'wordpiece' | 'words'
  /** What the build found on disk (sizes are real files); null when a file is not published. */
  assets: {
    vocab: { path: string; bytes: number } | null
    encoder: { path: string; bytes: number } | null
    runtime: { path: string; bytes: number } | null
  }
}

export interface LoadModelResult {
  /** Vocabulary, model and runtime bytes read into the worker. */
  bytes: number
  /** Of those, how many crossed the network: a few hundred bytes when the browser's cache answered. Absent when the browser does not report it. */
  transferred?: number
  dim: number
  /** Page elements (units.ts) embedded in this worker (0 when the precomputed embeddings covered them all). The protocol calls this `chunksEmbedded`. */
  chunksEmbedded: number
  /** Page elements whose vectors came from embeddings.json. */
  chunksPrecomputed: number
  /** Time spent in each phase, ms. */
  timings: { model: number; runtime: number; session: number; embeddings: number; total: number }
  modelBytes: number
  runtimeBytes: number
  /** The five parity sentences embedded by this worker, base64 float32 each: what /experiments/ exports as the parity fixture. */
  parity?: string[]
}

/** `progress.stage` strings the worker uses while it loads the model, in order. */
export type LoadStage = 'vocabulary' | 'model' | 'runtime' | 'session' | 'embeddings'

export type { CorpusSection, PartDepth, PartKind }
