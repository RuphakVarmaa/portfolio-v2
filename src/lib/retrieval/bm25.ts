/**
 * Okapi BM25 (spec 6.6: k1 = 1.2, b = 0.75), over documents that are already lists of terms.
 *
 *   score(q, d) = sum over distinct query terms t of
 *                 idf(t) * tf(t, d) * (k1 + 1) / (tf(t, d) + k1 * (1 - b + b * len(d) / avgLen))
 *   idf(t)      = ln(1 + (N - df + 0.5) / (df + 0.5))        (never negative, so a common term cannot subtract)
 *
 * The score is reported raw (spec 6.6): no normalisation, so 7.4 means the same thing on every query.
 * Which terms an index holds is the analyzer's business (analyze.ts); this file only counts and scores,
 * so it is a few dozen lines the tests can check against a worked example by hand.
 *
 * Pure and DOM-free (the worker, the build script, the main-thread fallback and /experiments/ import it).
 */

export const K1 = 1.2
export const B = 0.75

export interface Posting {
  /** Documents containing the term. */
  df: number
  idf: number
  /** Document indexes, ascending. */
  docs: Int32Array
  /** Term frequency in each of `docs`. */
  tfs: Int32Array
}

export interface Bm25Index {
  k1: number
  b: number
  /** Number of documents (chunks). */
  size: number
  /** Mean document length in terms. */
  avgLen: number
  /** Length of each document in terms. */
  lens: Int32Array
  postings: Map<string, Posting>
}

/** Lucene's non-negative idf. */
export function idf(size: number, df: number): number {
  return Math.log(1 + (size - df + 0.5) / (df + 0.5))
}

/** Build an index from one term list per document. */
export function buildBm25(docTerms: ReadonlyArray<readonly string[]>, options: { k1?: number; b?: number } = {}): Bm25Index {
  const size = docTerms.length
  const lens = new Int32Array(size)
  const building = new Map<string, { docs: number[]; tfs: number[] }>()
  let total = 0
  docTerms.forEach((terms, docIndex) => {
    lens[docIndex] = terms.length
    total += terms.length
    const counts = new Map<string, number>()
    for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1)
    for (const [term, tf] of counts) {
      let entry = building.get(term)
      if (!entry) {
        entry = { docs: [], tfs: [] }
        building.set(term, entry)
      }
      entry.docs.push(docIndex)
      entry.tfs.push(tf)
    }
  })
  const postings = new Map<string, Posting>()
  for (const [term, entry] of building) {
    postings.set(term, { df: entry.docs.length, idf: idf(size, entry.docs.length), docs: Int32Array.from(entry.docs), tfs: Int32Array.from(entry.tfs) })
  }
  return { k1: options.k1 ?? K1, b: options.b ?? B, size, avgLen: size === 0 ? 0 : total / size, lens, postings }
}

function saturation(index: Bm25Index, tf: number, len: number): number {
  const avg = index.avgLen > 0 ? index.avgLen : 1
  return (tf * (index.k1 + 1)) / (tf + index.k1 * (1 - index.b + (index.b * len) / avg))
}

export interface Bm25Scores {
  /** Raw BM25 score per document (0 for documents that match nothing). */
  scores: Float64Array
  /** How many of the distinct query terms each document contains. */
  matched: Int32Array
}

/** One distinct question term and its postings (undefined when no document has it). */
export interface QueryTerm {
  stem: string
  posting: Posting | undefined
}

/** Look up the postings of a question's distinct stems: the "query side" of BM25. */
export function queryTerms(index: Bm25Index, stems: readonly string[]): QueryTerm[] {
  const out: QueryTerm[] = []
  const seen = new Set<string>()
  for (const stem of stems) {
    if (seen.has(stem)) continue
    seen.add(stem)
    out.push({ stem, posting: index.postings.get(stem) })
  }
  return out
}

/** Score every document for looked-up question terms. */
export function scoreTerms(index: Bm25Index, terms: readonly QueryTerm[]): Bm25Scores {
  const scores = new Float64Array(index.size)
  const matched = new Int32Array(index.size)
  for (const { posting } of terms) {
    if (!posting) continue
    for (let i = 0; i < posting.docs.length; i++) {
      const doc = posting.docs[i]
      scores[doc] += posting.idf * saturation(index, posting.tfs[i], index.lens[doc])
      matched[doc] += 1
    }
  }
  return { scores, matched }
}

/** Score every document for a question given as stems (repeats count once). */
export function scoreBm25(index: Bm25Index, stems: readonly string[]): Bm25Scores {
  return scoreTerms(index, queryTerms(index, stems))
}

export interface TermContribution {
  stem: string
  tf: number
  idf: number
  /** What this term added to the document's score. */
  score: number
}

/** Why a document scored what it did: the per-term parts of `scoreBm25`, largest first. */
export function explainBm25(index: Bm25Index, doc: number, stems: readonly string[]): TermContribution[] {
  const out: TermContribution[] = []
  const seen = new Set<string>()
  for (const stem of stems) {
    if (seen.has(stem)) continue
    seen.add(stem)
    const posting = index.postings.get(stem)
    if (!posting) continue
    const at = posting.docs.indexOf(doc)
    if (at < 0) continue
    out.push({ stem, tf: posting.tfs[at], idf: posting.idf, score: posting.idf * saturation(index, posting.tfs[at], index.lens[doc]) })
  }
  return out.sort((a, b) => b.score - a.score || (a.stem < b.stem ? -1 : 1))
}

/**
 * Indexes of the best `k` entries of `values` strictly above `min`, best first. Ties keep document order,
 * so the same question always gives the same ranking.
 */
export function topK(values: ArrayLike<number>, k: number, min = 0): number[] {
  const ranked: number[] = []
  for (let i = 0; i < values.length; i++) if (values[i] > min) ranked.push(i)
  ranked.sort((a, b) => values[b] - values[a] || a - b)
  return ranked.slice(0, Math.max(0, k))
}

/** Every term in the index with its document frequency and idf, most frequent first (for the index explorer). */
export function termTable(index: Bm25Index): Array<{ term: string; df: number; idf: number }> {
  return [...index.postings].map(([term, p]) => ({ term, df: p.df, idf: p.idf })).sort((a, b) => b.df - a.df || (a.term < b.term ? -1 : 1))
}
