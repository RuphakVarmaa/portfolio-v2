/**
 * The retrieval corpus: the page's own text cut into 256-wordpiece windows (spec 6.6).
 *
 * `buildCorpus` is pure: records in (what the home page renders, section by section), chunks out. The
 * build script (scripts/build-corpus.ts) feeds it the records from page-records.ts and writes the result
 * to public/retrieval/corpus.json; the worker and the /experiments/ index explorer read that file.
 *
 * File format (a superset of the spec's `{ model, window, overlap, chunks }`; output is byte-identical for
 * identical input, keys sorted):
 *
 *   model        'bm25+minilm'
 *   window, overlap, stride     256, 64, 192
 *   tokenizer    'wordpiece' when windows were counted with the BERT vocabulary, 'words' when
 *                public/models/minilm/vocab.txt was absent (windows then count words, and the embedding path stays off)
 *   assets       what the build found on disk: the vocabulary, the encoder (if published), the ONNX Runtime WASM
 *   sections     reading order; `tokens` is the section's length in tokens, `windows` how many windows cover it,
 *                `context` the heading words BM25 indexes with every window of the section
 *   chunks       one per window: { id, sectionId, anchor, text, tokens, start, end, hash, parts, shown? }
 *                `start`/`end` are token offsets inside the section; `parts` says which page elements the
 *                window's text came from (their label, and where they sit inside `text`); `shown` (only when it
 *                differs from all of `text`) is the stretch a card shows, the window without the broken ends of
 *                words that a wordpiece cut left at its edges
 *
 * Pure and DOM-free.
 */
import { WINDOW, STRIDE, OVERLAP, cutWindows, windowSlice, type TokenSpan } from './chunker.ts'
import { basicWords, tokenize, type Vocab } from './wordpiece.ts'

/** The three explanation depths (same union as `Depth` in src/data/copy.ts, kept local so this file has no data import). */
export type PartDepth = '30s' | 'engineer' | 'peer'

/**
 * How a record is shown on the page:
 *   text   always visible
 *   label  a heading or small label (it is part of the window's text but is never picked as the cited sentence)
 *   plain  a plain-language caption, hidden while "Plain language" is off
 */
export type PartKind = 'text' | 'label' | 'plain'

/** One element's worth of rendered text, in reading order. Produced by page-records.ts. */
export interface PageRecord {
  /** Section it belongs to: one of the home page's hash targets (`control-room`, `service-retrieval`, ...). */
  sectionId: string
  /** The DOM id a citation scrolls to. */
  anchor: string
  /** Where it is, in words: `Service 01 · Engineer explanation`. */
  label: string
  /** Exactly what the page renders. */
  text: string
  /** Set for the explanation texts: only on the page while the depth switch is on that depth. */
  depth?: PartDepth
  kind?: PartKind
  /**
   * Records that belong together on the page share a group (a release's role, organization, period and note;
   * a work-trace label and its text). A question is matched against the whole group, and the citation points
   * at the group's best sentence: that is how "Which cloud did Neural Inverse use?" reaches the Neural
   * Inverse note, which never repeats the name.
   */
  group?: string
}

export interface CorpusPart {
  label: string
  /** Where this element's text sits inside the chunk's `text` (clipped to the window). */
  from: number
  to: number
  depth?: PartDepth
  kind?: PartKind
  group?: string
  /** Set when the window starts and/or ends inside this element: it continues in a neighbouring window. */
  cut?: 'start' | 'end' | 'both'
}

/** A range of characters inside a window's `text`: `[from, to)`. */
export interface TextRange {
  from: number
  to: number
}

export interface CorpusChunk {
  /** `${sectionId}.${window index}`; embeddings are keyed by it. */
  id: string
  sectionId: string
  anchor: string
  text: string
  /** Tokens in the window (wordpieces, or words in the fallback). */
  tokens: number
  /** Token offsets inside the section: `[start, end)`. */
  start: number
  end: number
  /** FNV-1a of `text`: lets a precomputed embedding prove it was made from this exact text. */
  hash: string
  parts: CorpusPart[]
  /**
   * The stretch of `text` a person reads, when it is not all of it (see `shownRange`): a window is cut at wordpieces, so
   * one can begin "% retrieval precision" where the page says "87% retrieval precision". This is the window with the broken
   * ends of words left off. The window, its id and offsets, and the text that is indexed, embedded and hashed do not change.
   * Absent when both ends already sit beside a space or at the edge of the section.
   */
  shown?: TextRange
}

export interface CorpusSection {
  id: string
  anchor: string
  title: string
  /**
   * The words of the section's heading, indexed by BM25 with every window of the section (and prepended to the
   * encoder input): the production system kept the source title as citation metadata, and it is what lets
   * "the RBAC project" find the RBAC panel even in a window that never repeats the title.
   */
  context: string
  /** The section's length in tokens. */
  tokens: number
  /** Number of windows that cover it. */
  windows: number
}

export interface CorpusAsset {
  /** Path inside the site, no leading slash: `models/minilm/vocab.txt`. */
  path: string
  bytes: number
}

export interface Corpus {
  model: 'bm25+minilm'
  window: number
  overlap: number
  stride: number
  tokenizer: 'wordpiece' | 'words'
  assets: {
    vocab: (CorpusAsset & { sha256: string; entries: number }) | null
    encoder: CorpusAsset | null
    runtime: CorpusAsset | null
  }
  sections: CorpusSection[]
  chunks: CorpusChunk[]
}

export interface SectionDefinition {
  id: string
  anchor: string
  /** For display: `Service 03 · Multi-Tenant RBAC Platform`. */
  title: string
  /** For retrieval (see CorpusSection.context): `Multi-Tenant RBAC Platform`. */
  context: string
}

export interface BuildCorpusOptions {
  /** Reading order. A section with no record is left out. */
  sections: readonly SectionDefinition[]
  records: readonly PageRecord[]
  /** The BERT vocabulary, or null to count words instead (the documented fallback). */
  vocab: Vocab | null
  assets?: Partial<Corpus['assets']>
}

/** What may sit just before the first character of a window without its word being broken: an opening bracket or quote, nothing else. */
const OPENING = /^[([{"'“‘«]+$/
/** What may follow the last character of a window without its word being broken: the full stop, comma or closing bracket that ends it. */
const CLOSING = /^[.,;:!?)\]}"'’”»…]+$/

/**
 * The stretch of a window a person should read: the window without the broken ends of words it holds only a piece of.
 *
 * Windows are cut at wordpieces (the unit the encoder counts), and BERT makes every punctuation mark a word of its own, so a
 * window may begin between "87" and "%" ("% retrieval precision"), or end between "sub-" and "2". A cut is harmless where
 * only an opening bracket lies before the window's first character, or only the full stop, comma or closing bracket of the
 * word after its last (the window ends "...instead of pgvector" and the page goes on "."). Anywhere else the end that
 * meets a word is moved in to the nearest space, so the card begins and ends on whole words. `from` and `to` are
 * offsets into the section's text (the window is `[from, to)`). The answer is in the window's own coordinates (0 is
 * `from`), or null when nothing needs moving. A window that is one broken word and nothing else is left as it is.
 */
export function shownRange(section: string, from: number, to: number): TextRange | null {
  const space = (at: number): boolean => /\s/.test(section[at])
  let start = from
  let head = from
  while (head > 0 && !space(head - 1)) head -= 1
  const before = section.slice(head, from)
  if (before !== '' && !OPENING.test(before)) {
    let at = from
    while (at < to && !space(at)) at += 1 // the rest of the word the window begins inside
    while (at < to && space(at)) at += 1 // and the space after it
    if (at < to) start = at
  }
  let end = to
  let tail = to
  while (tail < section.length && !space(tail)) tail += 1
  const after = section.slice(to, tail)
  if (after !== '' && !CLOSING.test(after)) {
    let at = to
    while (at > start && !space(at - 1)) at -= 1 // back over the word the window ends inside
    while (at > start && space(at - 1)) at -= 1 // and the space before it
    if (at > start) end = at
  }
  return start === from && end === to ? null : { from: start - from, to: end - from }
}

/** FNV-1a, 32 bit, as 8 hex digits. Not cryptographic: it only has to notice that a text changed. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function tokensOf(text: string, vocab: Vocab | null): TokenSpan[] {
  if (vocab) return tokenize(text, vocab).map((piece) => ({ start: piece.start, end: piece.end, first: piece.first }))
  return basicWords(text).map((word) => ({ start: word.start, end: word.end, first: true }))
}

/** Cut the page's text into windows, one section at a time. Deterministic. */
export function buildCorpus(options: BuildCorpusOptions): Corpus {
  const { sections: definitions, records, vocab } = options
  const sections: CorpusSection[] = []
  const chunks: CorpusChunk[] = []

  for (const definition of definitions) {
    const own = records.filter((record) => record.sectionId === definition.id && record.text.trim() !== '')
    if (own.length === 0) continue

    // The section's text: one record per line, so a record boundary is always a word boundary.
    const spans: Array<{ record: PageRecord; from: number; to: number }> = []
    let text = ''
    for (const record of own) {
      if (text !== '') text += '\n'
      const from = text.length
      text += record.text
      spans.push({ record, from, to: text.length })
    }

    const tokens = tokensOf(text, vocab)
    const windows = cutWindows(tokens)
    sections.push({ id: definition.id, anchor: definition.anchor, title: definition.title, context: definition.context, tokens: tokens.length, windows: windows.length })

    windows.forEach((window, index) => {
      const slice = windowSlice(text, tokens, window)
      const parts: CorpusPart[] = []
      for (const span of spans) {
        const from = Math.max(span.from, slice.from)
        const to = Math.min(span.to, slice.to)
        if (to <= from) continue
        const part: CorpusPart = { label: span.record.label, from: from - slice.from, to: to - slice.from }
        if (span.record.depth) part.depth = span.record.depth
        if (span.record.kind && span.record.kind !== 'text') part.kind = span.record.kind
        if (span.record.group) part.group = span.record.group
        const cutStart = from > span.from
        const cutEnd = to < span.to
        if (cutStart || cutEnd) part.cut = cutStart && cutEnd ? 'both' : cutStart ? 'start' : 'end'
        parts.push(part)
      }
      const shown = shownRange(text, slice.from, slice.to)
      chunks.push({
        id: `${definition.id}.${index}`,
        sectionId: definition.id,
        anchor: definition.anchor,
        text: slice.text,
        tokens: window.end - window.start,
        start: window.start,
        end: window.end,
        hash: fnv1a(slice.text),
        parts,
        ...(shown ? { shown } : {}),
      })
    })
  }

  return {
    model: 'bm25+minilm',
    window: WINDOW,
    overlap: OVERLAP,
    stride: STRIDE,
    tokenizer: vocab ? 'wordpiece' : 'words',
    assets: { vocab: options.assets?.vocab ?? null, encoder: options.assets?.encoder ?? null, runtime: options.assets?.runtime ?? null },
    sections,
    chunks,
  }
}

/** JSON with every object's keys sorted and one trailing newline: identical input gives identical bytes. */
export function stableStringify(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort)
    if (input !== null && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => [k, sort(v)]),
      )
    }
    return input
  }
  return JSON.stringify(sort(value)) + '\n'
}

export function serializeCorpus(corpus: Corpus): string {
  return stableStringify(corpus)
}

/** The text of one part inside its chunk. */
export function partText(chunk: Pick<CorpusChunk, 'text'>, part: Pick<CorpusPart, 'from' | 'to'>): string {
  return chunk.text.slice(part.from, part.to)
}
