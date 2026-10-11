/**
 * Short UI strings of the retrieval demo: status words, button verbs, announcements, the reasons a tap is
 * unavailable. Spec prose (the captions, the chips, the placeholder, the tap label, the stage names) is NOT here:
 * it comes from `copy.services.retrieval` and is the only source of those sentences.
 *
 * This file is imported by the lazy demo chunk only; the panel's entry (index.tsx) keeps its two static
 * sentences to itself so these strings stay out of the initial JavaScript.
 *
 * SPEC-GAP: these few sentences are new UI copy. If the owner wants them with the rest of the prose, move
 * this object into `copy.services.retrieval.demo` (src/data/copy.ts, owned by F) and import it from there.
 */
import { formatBytes, formatMs } from '../../../cluster/format.ts'

export const S = {
  /** Shown before the first question. */
  idle: "Ask anything about this page. The answer is a passage cut from the page's own text, with its source: nothing is generated.",
  ask: 'Ask',
  asking: 'Searching',
  inputLabel: 'Your question',
  chipsLabel: 'Or try one of these',
  emptyQuestion: 'Type a question first, or pick one of these.',

  /** The status plate under the label. */
  index: {
    label: 'Index',
    value: (chunks: number, terms: number) => `${chunks} windows · ${terms} terms`,
    built: 'Built here',
    builtValue: (bytes: number, fetchMs: number, indexMs: number) => `${formatBytes(bytes)} fetched in ${formatMs(fetchMs)} · indexed in ${formatMs(indexMs)}`,
  },
  worker: { label: 'Worker', ready: 'ready', starting: 'starting', down: 'restarting', standby: 'standby', degraded: 'degraded', busy: 'working', none: 'no Web Worker', mainThread: 'main thread' },
  engine: { label: 'Engine', bm25: 'BM25', hybrid: 'BM25 + MiniLM' },
  mainThread: 'No Web Worker here, so the index runs on the main thread. It is the same code.',

  indexing: "Building the index from this page's text",
  indexFailed: 'The index could not be built.',
  searchFailed: 'The search failed.',
  retry: 'Try again',

  resultsHeading: (query: string) => `Results for “${query}”`,
  none: (query: string) => `No passage matches “${query}”.`,
  count: (shown: number, candidates: number) =>
    candidates > shown ? `${shown} of ${candidates} passages` : `${shown} passage${shown === 1 ? '' : 's'}`,
  rank: (n: number) => `Rank ${n}.`,
  best: 'Best match',
  bm25: 'BM25',
  cosine: 'Cosine',
  wordsFound: (n: number, of: number) => (of === 0 ? 'no searchable words' : `${n} of ${of} word${of === 1 ? '' : 's'} found`),
  scoreParts: 'BM25 is the sum of',
  find: 'Find it on this page',
  passageFrom: (where: string) => `From: ${where}`,
  findAt: (depth: string) => `It is in the ${depth} explanation; the page switches to it.`,
  findPlain: 'It is a plain-language caption; the captions are switched on to show it.',
  findElsewhere: 'It is on the home page; this opens it there and underlines the sentence.',

  skipped: (n: number) => `… ${n} more line${n === 1 ? '' : 's'}`,
  showWhole: (total: number) => `Show the whole window (${total} lines)`,
  showExcerpt: 'Show only the excerpt',
  excerptOf: (shown: number, total: number) => `Excerpt: ${shown} of ${total} lines in this window`,
  wholeWindow: (total: number) => `The whole window, as the retriever returned it: ${total} lines`,

  windowCaption: (index: number, count: number, start: number, end: number, tokens: number, overlap: number | null) =>
    `Window ${index + 1} of ${count} · wordpieces ${start}–${end} of ${tokens}` +
    (overlap === null ? '' : ` · shares ${overlap} with its neighbour${overlap === 0 ? '' : 's'}`),
  windowRule: 'each rule is 64 wordpieces',

  timings: 'Measured in the retrieval worker',
  timingsMain: 'Measured on the main thread',
  timingsLabel: 'Pipeline timings',
  roundTrip: 'round trip',
  total: 'total',
  rerankNote: (what: string) => `rerank: ${what}`,
  /**
   * Under the timings: what the pipeline drawing does and does not show (replay.ts has the rules). It is true
   * whether the replay animates or, under reduced motion, fills in at once, so it says what is never lit and never
   * timed rather than how the lighting moves.
   */
  drawingNote:
    'The pipeline drawing is the production system’s. This port has no LLM, so the part named agents is production only: it is never lit and never shows a time. Tokenize runs and is timed, but the drawing has no part for it: its time is in the stage lists, not on the drawing.',
  coldStart: (ms: number) => `first search after a start: the worker also fetched and indexed the page (${formatMs(ms)})`,

  announce: {
    results: (n: number, query: string, where: string, mode: string) => `${n} passage${n === 1 ? '' : 's'} for ${query}. Best match: ${where}, ${mode}.`,
    none: (query: string) => `No passage on this page matches ${query} well. Try one of the suggestions.`,
    error: 'The search failed.',
    modelStart: (size: string) => `Loading the embedding model, ${size}.`,
    modelDone: (ms: number, embedded: number, precomputed: number) =>
      `Embedding model ready after ${formatMs(ms)}. ${precomputed > 0 ? `${precomputed} page elements use the vectors made at build time` : `${embedded} page elements embedded here`}. Searches now use BM25 and the embedding together.`,
    modelStopped: 'Model download stopped.',
    modelFailed: 'The embedding model could not be loaded. BM25 is still live.',
    revealDepth: (depth: string) => `Switched to the ${depth} explanation to show the passage.`,
    revealPlain: 'Switched the plain-language captions on to show the passage.',
    cited: (where: string) => `Showing ${where}.`,
    citedSection: 'Showing the section. The exact sentence is not on the page right now.',
    toHome: 'Opening the home page at that section.',
  },

  tap: {
    label: 'Tier 1 · embeddings',
    stop: 'Stop',
    loading: 'Loading',
    done: 'Embedding model loaded',
    engineLabel: 'Search with',
    reloadNote: 'The worker restarted, so the model has to be loaded again.',
    measured: (model: string, runtime: string) => `This build: ${model} model, ${runtime} runtime`,
    stages: { vocabulary: 'vocabulary', model: 'model', runtime: 'runtime', session: 'starting the session', embeddings: 'embedding the page elements' },
    readCached: (bytes: string) => `${bytes} read from this browser's cache`,
    readNetwork: (bytes: string, network: string, whole: boolean) => (whole ? `${bytes} read over the network` : `${bytes} read, ${network} of it over the network`),
    unavailable: {
      basic: 'This device runs the Basic tier: models stay off. BM25 is live.',
      noSimd: 'Your browser has no WebAssembly SIMD, which the embedding runtime needs. BM25 is live.',
      noWorker: 'Models need a Web Worker, which this browser does not have. BM25 is live.',
      noVocabulary: 'The corpus was cut without the vocabulary file, so it cannot be embedded. BM25 is live.',
    },
    failed: (message: string) => `The model could not be loaded: ${message}`,
    restarting: 'Restarting the retrieval worker, then trying again.',
  },
} as const

/** `22.97 MB` for the tap's measured line. */
export const size = formatBytes
