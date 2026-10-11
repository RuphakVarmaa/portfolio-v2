/**
 * The retrieval engine: a corpus in, ranked and cited passages out. It is the whole of "Agentic RAG
 * Document Intelligence, minus the LLM": retrieval and grounding, which are the demonstrable parts.
 *
 * One search runs the five stages the panel names (copy.services.retrieval.pipeline), each timed with
 * `performance.now()` around the real work:
 *
 *   tokenize         the question's words for BM25 (stop words out, stems in) and, in embedding mode, its WordPieces
 *   embed (or BM25)  BM25: look the stems up in the index. Embeddings: run the encoder on the question.
 *   score            BM25: score every window. Embeddings: cosine against every page-element vector, a window taking
 *                    the cosine of its nearest element (units.ts says why), and BM25 for the card.
 *   rerank           BM25: scale each score by the share of the question's words the window holds (the classic
 *                    "coordination factor"). Embeddings: fuse the BM25 and cosine rankings (reciprocal rank
 *                    fusion, cosine counting half). Both: apply the relevance floor (spec 4.3: BM25 < 0.5 or
 *                    cosine < 0.25 is not a match) and cut to the top K.
 *   cite             pick the sentence that answers, say which page element it came from, and attach the
 *                    window's place in its section (everything a citation needs)
 *
 * Runs in the retrieval worker, and on the main thread as the documented fallback when Web Workers are
 * unavailable (BM25 needs nothing else). Pure and DOM-free; the encoder is injected.
 */
import type { Stage } from '../../cluster/protocol.ts'
import { analyze, analyzeQuery, terms } from './analyze.ts'
import { buildBm25, explainBm25, queryTerms, scoreTerms, topK, type Bm25Index } from './bm25.ts'
import type { Corpus, CorpusChunk, CorpusSection } from './corpus.ts'
import { dot } from './cosine.ts'
import type { SentenceEncoder } from './embed.ts'
import { MODEL_NOT_LOADED } from './messages.ts'
import { splitSentences } from './sentences.ts'
import type { Evidence, RetrievalMode, RichHit, SearchResult } from './types.ts'
import { embedUnits, type EmbedUnit } from './units.ts'

/** Spec 4.3: below this raw BM25 score a window is not a match. */
export const BM25_FLOOR = 0.5
/** Spec 4.3: below this cosine a window is not a match. */
export const COSINE_FLOOR = 0.25
/** How many BM25 candidates the rerank stage looks at. */
export const RERANK_POOL = 10
/** Reciprocal rank fusion constant (the usual 60) and the weight of the cosine ranking against the BM25 one. */
export const RRF_K = 60
export const COSINE_WEIGHT = 0.5
/** The stage names, exactly as copy.services.retrieval.pipeline spells them (the panel matches on them). */
export const STAGE_NAMES = ['tokenize', 'embed (or BM25)', 'score', 'rerank', 'cite'] as const

export { MODEL_NOT_LOADED }

export interface SearchOptions {
  mode: RetrievalMode
  topK: number
  /** Called as each stage finishes, so a worker can report progress while it runs. */
  onStage?: (stage: Stage) => void
}

export interface IndexStats {
  chunks: number
  terms: number
  avgLen: number
  sections: number
  /** ms spent building the index. */
  buildMs: number
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000

export class RetrievalEngine {
  readonly corpus: Corpus
  readonly index: Bm25Index
  readonly stats: IndexStats
  private readonly now: () => number
  private readonly sectionOf: CorpusSection[]
  private readonly windows = new Map<string, Array<{ start: number; end: number }>>()
  /** The page elements the encoder embeds (units.ts), in the order `inputs()` lists them. */
  private readonly units: EmbedUnit[]
  private encoder: SentenceEncoder | null = null
  /** One unit vector per entry of `units`. */
  private vectors: Float32Array[] | null = null

  constructor(corpus: Corpus, now: () => number = () => performance.now()) {
    const started = now()
    this.corpus = corpus
    this.now = now
    const sections = new Map(corpus.sections.map((section) => [section.id, section]))
    this.sectionOf = corpus.chunks.map((chunk) => {
      const section = sections.get(chunk.sectionId)
      if (!section) throw new Error(`Chunk ${chunk.id} belongs to an unknown section "${chunk.sectionId}"`)
      return section
    })
    for (const chunk of corpus.chunks) {
      const list = this.windows.get(chunk.sectionId) ?? []
      list.push({ start: chunk.start, end: chunk.end })
      this.windows.set(chunk.sectionId, list)
    }
    this.units = embedUnits(corpus)
    // Each window is indexed with its section's heading words (see CorpusSection.context).
    this.index = buildBm25(corpus.chunks.map((chunk, i) => [...analyze(this.sectionOf[i].context), ...analyze(chunk.text)]))
    this.stats = {
      chunks: corpus.chunks.length,
      terms: this.index.postings.size,
      avgLen: this.index.avgLen,
      sections: corpus.sections.length,
      buildMs: round3(now() - started),
    }
  }

  get hasEncoder(): boolean {
    return this.encoder !== null && this.vectors !== null
  }

  /** What the encoder is given for each page element of the corpus (the build script and the worker both use it). */
  inputs(): Array<{ id: string; input: string }> {
    return this.units.map((unit) => ({ id: unit.id, input: unit.input }))
  }

  /** Turn embedding mode on: `vectors[i]` is the unit vector of `inputs()[i]`. */
  attachEncoder(encoder: SentenceEncoder, vectors: Float32Array[]): void {
    if (vectors.length !== this.units.length) throw new Error('One vector per page element is required')
    this.encoder = encoder
    this.vectors = vectors
  }

  detachEncoder(): void {
    this.encoder = null
    this.vectors = null
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult> {
    const { mode, topK: k } = options
    if (mode === 'embed' && (!this.encoder || !this.vectors)) throw new Error(MODEL_NOT_LOADED)
    const stages: Stage[] = []
    let mark = this.now()
    const done = (name: (typeof STAGE_NAMES)[number]) => {
      const now = this.now()
      const stage = { name, ms: round3(now - mark) }
      stages.push(stage)
      options.onStage?.(stage)
      mark = this.now()
    }

    // 1. tokenize
    const asked = analyzeQuery(query)
    const prepared = mode === 'embed' && this.encoder ? this.encoder.prepare(query) : null
    done('tokenize')

    // 2. embed (or BM25)
    const lookups = queryTerms(this.index, asked.stems)
    const queryVector = prepared && this.encoder ? await this.encoder.run(prepared) : null
    done('embed (or BM25)')

    // 3. score
    const bm25 = scoreTerms(this.index, lookups)
    let cosines: Float64Array | null = null
    /** Per window: the part of it whose element vector was nearest the question (-1 when the window has no element). */
    let nearest: Int32Array | null = null
    if (queryVector && this.vectors) {
      // A window takes the cosine of its nearest page element (units.ts: why elements and not the window).
      cosines = new Float64Array(this.corpus.chunks.length).fill(Number.NEGATIVE_INFINITY)
      nearest = new Int32Array(this.corpus.chunks.length).fill(-1)
      for (let i = 0; i < this.units.length; i++) {
        const unit = this.units[i]
        const value = dot(queryVector, this.vectors[i])
        if (value > cosines[unit.chunk]) {
          cosines[unit.chunk] = value
          nearest[unit.chunk] = unit.part
        }
      }
    }
    done('score')

    // 4. rerank
    let order: number[]
    let candidates: number
    let rerank: string
    if (cosines) {
      // Hybrid: fuse the two rankings. BM25 keeps its exact-word precision; the embedding (of page elements,
      // see units.ts) is what finds a passage worded differently from the question. A window with no element
      // has a cosine of -Infinity and never passes the floor.
      const total = this.corpus.chunks.length
      const rankOf = (values: ArrayLike<number>, floor: number) => new Map(topK(values, total, floor - 1e-9).map((chunk, at) => [chunk, at + 1] as const))
      const bmRanks = rankOf(bm25.scores, BM25_FLOOR)
      const cosRanks = rankOf(cosines, COSINE_FLOOR)
      const ids = [...new Set([...bmRanks.keys(), ...cosRanks.keys()])]
      candidates = ids.length
      const fused = new Map(
        ids.map((chunk) => {
          const bm = bmRanks.get(chunk)
          const co = cosRanks.get(chunk)
          return [chunk, (bm === undefined ? 0 : 1 / (RRF_K + bm)) + (co === undefined ? 0 : COSINE_WEIGHT / (RRF_K + co))] as const
        }),
      )
      order = ids.sort((a, b) => (fused.get(b) ?? 0) - (fused.get(a) ?? 0) || cosines[b] - cosines[a] || a - b).slice(0, k)
      rerank = 'BM25 and cosine rankings fused (cosine counts half), floors 0.5 and 0.25'
    } else {
      const pool = topK(bm25.scores, RERANK_POOL, BM25_FLOOR - 1e-9)
      candidates = topK(bm25.scores, this.corpus.chunks.length, BM25_FLOOR - 1e-9).length
      const denominator = Math.max(1, asked.stems.length)
      const final = new Map(pool.map((i) => [i, bm25.scores[i] * (0.6 + 0.4 * (bm25.matched[i] / denominator))]))
      order = [...pool].sort((a, b) => (final.get(b) as number) - (final.get(a) as number) || bm25.scores[b] - bm25.scores[a] || a - b).slice(0, k)
      rerank = 'BM25 × share of the question\'s words found, floor 0.5'
    }
    done('rerank')

    // 5. cite
    const idfOf = (stem: string) => this.index.postings.get(stem)?.idf ?? 0
    const hits = order.map((chunkIndex, position) =>
      this.cite(
        chunkIndex,
        position + 1,
        mode,
        bm25.scores[chunkIndex],
        cosines && Number.isFinite(cosines[chunkIndex]) ? cosines[chunkIndex] : undefined,
        nearest && nearest[chunkIndex] >= 0 ? nearest[chunkIndex] : undefined,
        asked,
        idfOf,
      ),
    )
    done('cite')

    return {
      hits,
      stages,
      mode,
      words: asked.words.map((w) => w.word),
      candidates,
      rerank,
      totalMs: round3(stages.reduce((sum, stage) => sum + stage.ms, 0)),
    }
  }

  private cite(
    chunkIndex: number,
    rank: number,
    mode: RetrievalMode,
    bm25: number,
    cosine: number | undefined,
    nearestPart: number | undefined,
    asked: ReturnType<typeof analyzeQuery>,
    idfOf: (stem: string) => number,
  ): RichHit {
    const chunk = this.corpus.chunks[chunkIndex]
    const section = this.sectionOf[chunkIndex]
    const inChunk = (stem: string): boolean => this.index.postings.get(stem)?.docs.includes(chunkIndex) ?? false
    const matchedWords = asked.words.filter((w) => inChunk(w.stem))
    const wordOf = new Map(asked.words.map((w) => [w.stem, w.word]))
    const contributions = explainBm25(this.index, chunkIndex, asked.stems).map((c) => ({ word: wordOf.get(c.stem) ?? c.stem, score: round3(c.score) }))
    const windows = this.windows.get(chunk.sectionId) ?? []
    const stems = new Set(asked.stems)
    let evidence = pickEvidence(chunk, stems, idfOf)
    if (nearestPart !== undefined) {
      // The citation is the sentence with the question's words. When it holds fewer than half of them (or none: an
      // embedding-only match) and the encoder points at another element of the window, cite that element's best sentence.
      const semantic = pickEvidenceIn(chunk, nearestPart, stems, idfOf)
      const held = evidence ? stemsIn(chunk.text.slice(evidence.from, evidence.to), stems) : 0
      if (semantic && (held === 0 || (evidence !== null && evidence.part !== nearestPart && held * 2 < stems.size))) evidence = semantic
    }
    const hit: RichHit = {
      chunkId: chunk.id,
      anchor: chunk.anchor,
      text: chunk.text,
      bm25: round3(bm25),
      window: { start: chunk.start, end: chunk.end },
      rank,
      mode,
      tokens: chunk.tokens,
      parts: chunk.parts,
      evidence,
      matched: matchedWords.map((w) => w.word),
      asked: asked.stems.length,
      contributions,
      context: section.context,
      section: {
        id: section.id,
        title: section.title,
        tokens: section.tokens,
        windows,
        index: windows.findIndex((w) => w.start === chunk.start && w.end === chunk.end),
      },
    }
    if (cosine !== undefined) hit.cosine = round3(cosine)
    return hit
  }
}

/** A sentence needs this many words to be cited when the group holds a real sentence; titles and tags are not sentences. */
const MIN_EVIDENCE_WORDS = 4

/**
 * The sentence of a window that best answers the question.
 *
 * Page elements that belong together (a release's role, organization and note; a work-trace label and its
 * text) are matched as one group, so a question can find a note through the name that sits beside it. The
 * best group is the one holding the most (idf-weighted) distinct question words; inside it the citation
 * points at the best real sentence (four words or more, so a title or a tag is not "the answer"). A sentence
 * cut off by the edge of the window counts half. With no word in common (an embedding-only match) it falls
 * back to the window's first sentence.
 */
export function pickEvidence(chunk: CorpusChunk, stems: ReadonlySet<string>, idfOf: (stem: string) => number): Evidence | null {
  interface Candidate {
    evidence: Evidence
    score: number
    words: number
    length: number
  }
  interface Group {
    stems: Set<string>
    candidates: Candidate[]
  }
  const groups = new Map<string, Group>()
  let first: Evidence | null = null

  for (let partIndex = 0; partIndex < chunk.parts.length; partIndex++) {
    const part = chunk.parts[partIndex]
    const body = chunk.text.slice(part.from, part.to)
    const key = part.group ?? `part:${partIndex}`
    let group = groups.get(key)
    if (!group) {
      group = { stems: new Set(), candidates: [] }
      groups.set(key, group)
    }
    for (const term of terms(body)) if (stems.has(term.stem)) group.stems.add(term.stem)
    if (part.kind === 'label') continue

    const ranges = splitSentences(body)
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i]
      const sentence = body.slice(range.from, range.to)
      const evidence: Evidence = { from: part.from + range.from, to: part.from + range.to, part: partIndex }
      if (first === null) first = evidence
      let score = 0
      for (const stem of new Set(terms(sentence).filter((t) => stems.has(t.stem)).map((t) => t.stem))) score += idfOf(stem)
      const cutAtStart = i === 0 && (part.cut === 'start' || part.cut === 'both')
      const cutAtEnd = i === ranges.length - 1 && (part.cut === 'end' || part.cut === 'both')
      if (cutAtStart || cutAtEnd) score *= 0.5
      group.candidates.push({ evidence, score, words: sentence.trim().split(/\s+/).length, length: range.to - range.from })
    }
  }

  /** The group's best candidate: a real sentence if it has one, then the most question words, then the longest. */
  const bestOf = (group: Group): Candidate => {
    const real = group.candidates.filter((c) => c.words >= MIN_EVIDENCE_WORDS)
    const pool = real.length > 0 ? real : group.candidates
    let chosen = pool[0]
    for (const candidate of pool) {
      if (candidate.score > chosen.score || (candidate.score === chosen.score && candidate.length > chosen.length)) chosen = candidate
    }
    return chosen
  }

  // The best group holds the most (idf-weighted) distinct question words. Groups that tie (a one-word question
  // matches many page elements equally) go to the one whose best sentence is a real sentence, then the one with
  // the most question words in it, then the longest: the sentence that says what was done, not a list of names.
  const key = (groupScore: number, c: Candidate): number[] => [
    Math.round(groupScore * 1e9),
    c.words >= MIN_EVIDENCE_WORDS ? 1 : 0,
    Math.round(c.score * 1e9),
    c.length,
  ]
  const beats = (a: number[], b: number[]): boolean => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]
    return false
  }
  let best: { key: number[]; candidate: Candidate } | null = null
  for (const group of groups.values()) {
    if (group.candidates.length === 0) continue
    let score = 0
    for (const stem of group.stems) score += idfOf(stem)
    if (score <= 0) continue
    const candidate = bestOf(group)
    const k = key(score, candidate)
    if (best === null || beats(k, best.key)) best = { key: k, candidate }
  }
  return best ? best.candidate.evidence : first
}

/** How many distinct question words (as stems) a piece of text holds. */
function stemsIn(text: string, stems: ReadonlySet<string>): number {
  return new Set(terms(text).filter((t) => stems.has(t.stem)).map((t) => t.stem)).size
}

/**
 * The best sentence inside one page element of a window: the one with the most question words, then the longest
 * real sentence (four words or more when the element has one). Null for a label or an element with no text. This
 * is what an embedding-only match cites: the element the encoder found nearest the question.
 */
export function pickEvidenceIn(chunk: CorpusChunk, partIndex: number, stems: ReadonlySet<string>, idfOf: (stem: string) => number): Evidence | null {
  const part = chunk.parts[partIndex]
  if (!part || part.kind === 'label') return null
  const body = chunk.text.slice(part.from, part.to)
  const ranges = splitSentences(body)
  const candidates = ranges.map((range, i) => {
    const sentence = body.slice(range.from, range.to)
    let score = 0
    for (const stem of new Set(terms(sentence).filter((t) => stems.has(t.stem)).map((t) => t.stem))) score += idfOf(stem)
    const cutAtStart = i === 0 && (part.cut === 'start' || part.cut === 'both')
    const cutAtEnd = i === ranges.length - 1 && (part.cut === 'end' || part.cut === 'both')
    if (cutAtStart || cutAtEnd) score *= 0.5
    return { evidence: { from: part.from + range.from, to: part.from + range.to, part: partIndex } satisfies Evidence, score, words: sentence.trim().split(/\s+/).length, length: range.to - range.from }
  })
  if (candidates.length === 0) return null
  const real = candidates.filter((c) => c.words >= MIN_EVIDENCE_WORDS)
  const pool = real.length > 0 ? real : candidates
  let chosen = pool[0]
  for (const candidate of pool) {
    if (candidate.score > chosen.score || (candidate.score === chosen.score && candidate.length > chosen.length)) chosen = candidate
  }
  return chosen.evidence
}
