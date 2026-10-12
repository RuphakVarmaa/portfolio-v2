import type { Stage } from '../../cluster/protocol.ts'
import { terms } from '../../lib/retrieval/analyze.ts'
import type { Corpus, CorpusChunk, CorpusPart, CorpusSection } from '../../lib/retrieval/corpus.ts'
import type { RichHit } from '../../lib/retrieval/types.ts'
import { fmtMs } from '../../sections/services/retrieval/format.ts'

/**
 * Pure helpers for the BM25 index explorer: the shape of the corpus file, where each window sits on the
 * section ribbon, the highlighted text of a chunk, the filtered term table, and the stage times.
 *
 * The explorer does not re-implement search. It builds the very `RetrievalEngine` the retrieval worker
 * builds (src/lib/retrieval/engine.ts) from the very file the worker fetches, so every term, count, score
 * and rank on the page is what a search on this site produces. These helpers only read the file safely and
 * lay its numbers out. No DOM, so `node --test` covers them.
 */

const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function parseSection(value: unknown): CorpusSection | null {
  if (!isRecord(value)) return null
  const { id, anchor, title, context, tokens, windows } = value
  if (!isString(id) || !isString(anchor) || !isString(title) || !isString(context) || !isNumber(tokens) || !isNumber(windows)) return null
  return { id, anchor, title, context, tokens, windows }
}

function parseChunk(value: unknown): CorpusChunk | null {
  if (!isRecord(value)) return null
  const { id, sectionId, anchor, text, tokens, start, end, hash, parts } = value
  if (!isString(id) || !isString(sectionId) || !isString(anchor) || !isString(text) || !isNumber(tokens) || !isNumber(start) || !isNumber(end)) return null
  return { id, sectionId, anchor, text, tokens, start, end, hash: isString(hash) ? hash : '', parts: Array.isArray(parts) ? (parts as CorpusPart[]) : [] }
}

/**
 * Defensive parse of /retrieval/corpus.json: only what the explorer and the engine read, nothing assumed.
 * Returns null when the file is not a corpus at all, or when it has chunks but none of them can be used
 * (the engine needs every chunk's section). A file with an empty `chunks` list is a valid, empty corpus.
 */
export function parseCorpus(value: unknown): Corpus | null {
  if (!isRecord(value) || !Array.isArray(value.chunks)) return null
  const sections = (Array.isArray(value.sections) ? value.sections : []).map(parseSection).filter((section): section is CorpusSection => section !== null)
  const known = new Set(sections.map((section) => section.id))
  const chunks = value.chunks.map(parseChunk).filter((chunk): chunk is CorpusChunk => chunk !== null && known.has(chunk.sectionId))
  if (value.chunks.length > 0 && chunks.length === 0) return null
  return {
    model: 'bm25+minilm',
    window: isNumber(value.window) ? value.window : 0,
    overlap: isNumber(value.overlap) ? value.overlap : 0,
    stride: isNumber(value.stride) ? value.stride : 0,
    tokenizer: value.tokenizer === 'wordpiece' ? 'wordpiece' : 'words',
    assets: { vocab: null, encoder: null, runtime: null },
    sections,
    chunks,
  }
}

export interface RibbonItem {
  chunkId: string
  /** Position on the shared scale, in percent of the longest section. */
  left: number
  width: number
  /** Overlapping neighbours alternate between two lines so the overlap is visible without transparency. */
  line: 0 | 1
  tokens: number
}

export interface RibbonRow {
  sectionId: string
  anchor: string
  title: string
  /** The section's length in tokens. */
  tokens: number
  /** How many lines its windows use: 1 for a section with one window, otherwise 2. */
  lines: 1 | 2
  items: RibbonItem[]
}

/**
 * Each window on the ribbon is a button, so each is a touch target: 44 px square at least (spec 8.2). The
 * drawn window inside it stays small; the box is what a finger hits. The two lines of overlapping windows
 * therefore sit one target plus a gap apart, so no two targets touch.
 */
export const RIBBON_TARGET = 44
export const RIBBON_GAP = 8

/** Distance from the top of a row's track to the top of the targets on `line` (0 or 1). */
export const ribbonTop = (line: number): number => line * (RIBBON_TARGET + RIBBON_GAP)

/** Height of a row's track: its lines of targets and the gaps between them. */
export const ribbonHeight = (lines: number): number => ribbonTop(Math.max(lines, 1) - 1) + RIBBON_TARGET

/**
 * One row per section in reading order, each window placed by its token offsets on ONE shared scale (the
 * longest section fills the track), so a short section is visibly short and a long one shows its windows
 * overlapping.
 */
export function ribbonRows(corpus: Corpus): RibbonRow[] {
  const bySection = new Map<string, Corpus['chunks']>()
  for (const chunk of corpus.chunks) bySection.set(chunk.sectionId, [...(bySection.get(chunk.sectionId) ?? []), chunk])
  const known = corpus.sections.length > 0 ? corpus.sections : [...bySection.keys()].map((id) => ({ id, anchor: id, title: id, context: '', tokens: 0, windows: 0 }))
  const present = known.filter((section) => bySection.has(section.id))
  const lengthOf = (section: (typeof present)[number]) => Math.max(section.tokens, ...(bySection.get(section.id) ?? []).map((chunk) => chunk.end), 1)
  const scale = Math.max(1, ...present.map(lengthOf))
  return present.map((section) => {
    const items = (bySection.get(section.id) ?? []).map(
      (chunk, index): RibbonItem => ({
        chunkId: chunk.id,
        left: (chunk.start / scale) * 100,
        width: Math.max(((chunk.end - chunk.start) / scale) * 100, 1.5),
        line: (index % 2) as 0 | 1,
        tokens: chunk.tokens,
      }),
    )
    return {
      sectionId: section.id,
      anchor: section.anchor,
      title: section.title,
      tokens: lengthOf(section),
      lines: items.length > 1 ? 2 : 1,
      items,
    }
  })
}

export interface Segment {
  text: string
  hit: boolean
}

/** Split `text` into runs, marking the words whose stem is one of `stems` (so `embeddings` matches a question about `embedding`). */
export function highlightSegments(text: string, stems: ReadonlySet<string>): Segment[] {
  if (stems.size === 0) return [{ text, hit: false }]
  const out: Segment[] = []
  let at = 0
  for (const term of terms(text)) {
    if (!stems.has(term.stem)) continue
    if (term.start > at) out.push({ text: text.slice(at, term.start), hit: false })
    out.push({ text: text.slice(term.start, term.end), hit: true })
    at = term.end
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false })
  return out
}

export interface TermRow {
  term: string
  df: number
  idf: number
}

export type TermSort = 'common' | 'rare'

/** The index's terms (from `termTable`), narrowed to a prefix and ordered; at most `limit` rows. */
export function filterTerms(rows: readonly TermRow[], prefix: string, sort: TermSort, limit = 40): TermRow[] {
  const needle = prefix.trim().toLowerCase()
  const matching = needle === '' ? [...rows] : rows.filter((row) => row.term.startsWith(needle))
  matching.sort((a, b) => (sort === 'common' ? b.df - a.df : a.df - b.df) || (a.term < b.term ? -1 : 1))
  return matching.slice(0, limit)
}

export interface IndexStats {
  chunks: number
  terms: number
  avgLen: number
  window: number
  overlap: number
  tokenizer: Corpus['tokenizer']
  /** ms the engine measured while building the index in this page. */
  buildMs: number
}

/** The numbers above the explorer: the engine's own counts and timing, with the window the corpus was cut at. */
export function indexStats(corpus: Pick<Corpus, 'window' | 'overlap' | 'tokenizer'>, engine: { chunks: number; terms: number; avgLen: number; buildMs: number }): IndexStats {
  return {
    chunks: engine.chunks,
    terms: engine.terms,
    avgLen: Math.round(engine.avgLen * 10) / 10,
    window: corpus.window,
    overlap: corpus.overlap,
    tokenizer: corpus.tokenizer,
    buildMs: engine.buildMs,
  }
}

export interface StageTime {
  name: string
  /** The measured time, printed. */
  time: string
}

/**
 * The strip under a question: each stage the engine ran and how long it took, printed the way the home
 * retrieval panel prints it (`fmtMs`). A stage too short for the browser's clock (it ticks in tenths of a
 * millisecond) reads `<0.1 ms`, never `0 ms`: a printed zero looks hard-coded, and these are measured.
 */
export function stageTimes(stages: readonly Stage[]): StageTime[] {
  return stages.map((stage) => ({ name: stage.name, time: fmtMs(stage.ms) }))
}

/**
 * The sentence a hit's citation points at (the engine's `evidence`: the best sentence of the window for this
 * question), or null when the engine found none.
 */
export function citedSentence(hit: Pick<RichHit, 'text' | 'evidence'>): string | null {
  if (!hit.evidence) return null
  const sentence = hit.text.slice(hit.evidence.from, hit.evidence.to).trim()
  return sentence === '' ? null : sentence
}

/**
 * A short passage of `text` around its first matching word (or its start, when nothing matches), cut at word
 * boundaries so a hit list stays readable. `before` / `after` say whether text was left out on either side.
 * Used when a hit has no cited sentence.
 */
export function snippet(text: string, stems: ReadonlySet<string>, radius = 110): { text: string; before: boolean; after: boolean } {
  const first = terms(text).find((term) => stems.has(term.stem))
  const centre = first ? first.start : 0
  let from = Math.max(0, centre - Math.round(radius / 2))
  let to = Math.min(text.length, centre + radius)
  if (from > 0) {
    const space = text.indexOf(' ', from)
    if (space >= 0 && space < centre) from = space + 1
  }
  if (to < text.length) {
    const space = text.lastIndexOf(' ', to)
    if (space > centre) to = space
  }
  return { text: text.slice(from, to).trim(), before: from > 0, after: to < text.length }
}
