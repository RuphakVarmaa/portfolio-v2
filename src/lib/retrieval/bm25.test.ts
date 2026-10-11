import assert from 'node:assert/strict'
import { test } from 'node:test'
import { B, K1, buildBm25, explainBm25, idf, scoreBm25, termTable, topK } from './bm25.ts'

const approx = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)

const DOCS = [
  ['pgvector', 'hnsw', 'index', 'index'], // 4 terms
  ['latency', 'index'], // 2 terms
  ['tenant', 'tenant', 'tenant', 'policy', 'audit'], // 5 terms
]

/** The textbook formula, written out term by term, independent of the implementation under test. */
function reference(docs: string[][], doc: number, query: string[]): number {
  const n = docs.length
  const avg = docs.reduce((sum, d) => sum + d.length, 0) / n
  let score = 0
  for (const term of new Set(query)) {
    const df = docs.filter((d) => d.includes(term)).length
    if (df === 0) continue
    const tf = docs[doc].filter((t) => t === term).length
    const w = Math.log(1 + (n - df + 0.5) / (df + 0.5))
    score += (w * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * docs[doc].length) / avg))
  }
  return score
}

test('parameters are the spec\'s: k1 = 1.2, b = 0.75', () => {
  assert.equal(K1, 1.2)
  assert.equal(B, 0.75)
  const index = buildBm25(DOCS)
  assert.equal(index.k1, 1.2)
  assert.equal(index.b, 0.75)
})

test('a worked example, by hand', () => {
  // N = 3, avgLen = (4 + 2 + 5) / 3. "pgvector" is in one document (df 1, tf 1, len 4).
  // idf = ln(1 + 2.5 / 1.5) = 0.98083; tf part = 2.2 / (1 + 1.2 * (0.25 + 0.75 * 4 / 3.6667)) = 0.96414, so 0.94566.
  const index = buildBm25(DOCS)
  approx(idf(3, 1), 0.980829, 1e-6)
  approx(scoreBm25(index, ['pgvector']).scores[0], 0.94566, 2e-5)
  assert.equal(scoreBm25(index, ['pgvector']).scores[1], 0)
  approx(index.avgLen, 11 / 3)
})

test('scoreBm25 equals the textbook formula for every document and several questions', () => {
  const index = buildBm25(DOCS)
  for (const query of [['index'], ['pgvector', 'index'], ['tenant', 'policy', 'audit'], ['latency', 'nothing'], ['hnsw', 'tenant']]) {
    const { scores } = scoreBm25(index, query)
    DOCS.forEach((_, doc) => approx(scores[doc], reference(DOCS, doc, query)))
  }
})

test('rarer terms weigh more, more occurrences help but saturate, and shorter documents win a tie on tf', () => {
  const index = buildBm25(DOCS)
  assert.ok(idf(3, 1) > idf(3, 2))
  assert.ok(idf(3, 2) > idf(3, 3))
  assert.ok(idf(3, 3) > 0, 'idf is never negative, so a term in every document cannot subtract')
  const tenant = scoreBm25(index, ['tenant']).scores[2]
  const once = scoreBm25(buildBm25([['tenant', 'x'], ['y', 'z'], ['w', 'v']]), ['tenant']).scores[0]
  assert.ok(tenant > once)
  // "index" is in docs 0 (tf 2, len 4) and 1 (tf 1, len 2): doc 0 still wins on tf.
  const index2 = scoreBm25(index, ['index']).scores
  assert.ok(index2[0] > index2[1] && index2[1] > 0)
  // Same tf, different length: the shorter document scores higher (b = 0.75 normalises length).
  const sameTf = scoreBm25(buildBm25([['a', 'b'], ['a', 'b', 'c', 'd', 'e', 'f'], ['q']]), ['a']).scores
  assert.ok(sameTf[0] > sameTf[1])
})

test('a repeated query term counts once, and an unknown term adds nothing', () => {
  const index = buildBm25(DOCS)
  assert.deepEqual(scoreBm25(index, ['index', 'index', 'index']).scores, scoreBm25(index, ['index']).scores)
  assert.deepEqual(scoreBm25(index, ['zzz']).scores, new Float64Array(3))
  assert.deepEqual(scoreBm25(index, []).scores, new Float64Array(3))
})

test('matched counts the distinct question terms each document contains', () => {
  const index = buildBm25(DOCS)
  assert.deepEqual(Array.from(scoreBm25(index, ['pgvector', 'index', 'tenant']).matched), [2, 1, 1])
  assert.deepEqual(Array.from(scoreBm25(index, ['index', 'index']).matched), [1, 1, 0])
})

test('explainBm25 splits a score into the parts that add up to it', () => {
  const index = buildBm25(DOCS)
  const query = ['pgvector', 'index', 'tenant']
  const parts = explainBm25(index, 0, query)
  assert.deepEqual(parts.map((p) => p.stem), ['pgvector', 'index'])
  approx(parts.reduce((sum, p) => sum + p.score, 0), scoreBm25(index, query).scores[0])
  assert.equal(parts.find((p) => p.stem === 'index')?.tf, 2)
  assert.deepEqual(explainBm25(index, 2, ['pgvector']), [])
})

test('topK ranks best first, breaks ties by document order, honours the floor and k', () => {
  const values = Float64Array.from([0.4, 2, 0, 2, 1])
  assert.deepEqual(topK(values, 3), [1, 3, 4])
  assert.deepEqual(topK(values, 10), [1, 3, 4, 0])
  assert.deepEqual(topK(values, 10, 0.5), [1, 3, 4])
  assert.deepEqual(topK(values, 0), [])
  assert.deepEqual(topK(new Float64Array(0), 5), [])
})

test('an empty index and empty documents do not divide by zero', () => {
  const empty = buildBm25([])
  assert.equal(empty.size, 0)
  assert.equal(empty.avgLen, 0)
  assert.deepEqual(scoreBm25(empty, ['a']).scores, new Float64Array(0))
  const blank = buildBm25([[], []])
  assert.equal(blank.avgLen, 0)
  assert.deepEqual(scoreBm25(blank, ['a']).scores, new Float64Array(2))
})

test('termTable lists every term with its document frequency, most common first', () => {
  const table = termTable(buildBm25(DOCS))
  assert.equal(table[0].term, 'index')
  assert.equal(table[0].df, 2)
  assert.equal(table.length, 7)
  assert.ok(table.every((row) => row.idf > 0))
})
