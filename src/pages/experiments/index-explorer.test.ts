import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyze, analyzeQuery } from '../../lib/retrieval/analyze.ts'
import { explainBm25, termTable } from '../../lib/retrieval/bm25.ts'
import { RetrievalEngine, STAGE_NAMES } from '../../lib/retrieval/engine.ts'
import { fmtMs } from '../../sections/services/retrieval/format.ts'
import {
  RIBBON_GAP,
  RIBBON_TARGET,
  citedSentence,
  filterTerms,
  highlightSegments,
  indexStats,
  parseCorpus,
  ribbonHeight,
  ribbonRows,
  ribbonTop,
  snippet,
  stageTimes,
} from './index-explorer.ts'

const chunk = (id: string, sectionId: string, text: string, start: number, end: number) => ({
  id,
  sectionId,
  anchor: sectionId,
  text,
  tokens: end - start,
  start,
  end,
  hash: '00000000',
  parts: [{ label: 'Retrieval', from: 0, to: text.length }],
})

const corpus = {
  model: 'bm25+minilm',
  window: 256,
  overlap: 64,
  stride: 192,
  tokenizer: 'words',
  sections: [
    { id: 'service-retrieval', anchor: 'service-retrieval', title: 'Retrieval', context: 'Agentic retrieval service', tokens: 448, windows: 2 },
    { id: 'contact', anchor: 'contact', title: 'Contact', context: 'Contact', tokens: 40, windows: 1 },
  ],
  chunks: [
    chunk('service-retrieval.0', 'service-retrieval', 'Chunks use pgvector HNSW indexing for retrieval. Nothing else is stored here.', 0, 256),
    chunk('service-retrieval.1', 'service-retrieval', 'Embeddings and embedding models were reranked by cosine over the whole page.', 192, 448),
    chunk('contact.0', 'contact', 'Email is best for every kind of question.', 0, 40),
  ],
}

test('the corpus file is parsed defensively: bad shapes give null, bad chunks and orphans are dropped', () => {
  assert.equal(parseCorpus(null), null)
  assert.equal(parseCorpus({ chunks: 'no' }), null)
  const parsed = parseCorpus({ ...corpus, chunks: [...corpus.chunks, { id: 5 }, null, chunk('x.0', 'no-such-section', 'orphan', 0, 1)] })
  assert.ok(parsed)
  assert.equal(parsed.chunks.length, 3, 'the engine needs every chunk to have a section, so an orphan is dropped')
  assert.equal(parsed.tokenizer, 'words')
  assert.equal(parsed.sections.length, 2)
  assert.deepEqual(parseCorpus({ chunks: [] })?.chunks, [], 'the empty placeholder is a valid, empty corpus')
  assert.equal(parseCorpus({ chunks: corpus.chunks }), null, 'chunks with no sections cannot be indexed like the worker does')
  assert.equal(parseCorpus({ ...corpus, sections: [{ id: 'service-retrieval' }] }), null, 'a section without its fields is not a section')
})

test('the ribbon places each window by its token offsets on one shared scale and alternates lines so overlaps stay visible', () => {
  const rows = ribbonRows(parseCorpus(corpus)!)
  assert.deepEqual(rows.map((row) => row.title), ['Retrieval', 'Contact'])
  const [a, b] = rows[0].items
  assert.equal(a.left, 0)
  assert.ok(Math.abs(a.width - (256 / 448) * 100) < 1e-9)
  assert.ok(Math.abs(b.left - (192 / 448) * 100) < 1e-9)
  assert.notEqual(a.line, b.line, 'neighbouring windows overlap, so they sit on different lines')
  assert.ok(a.left + a.width > b.left, 'and they really do overlap')
  assert.ok(Math.abs(b.left + b.width - 100) < 1e-9, 'the longest section fills the track')
  const [short] = rows[1].items
  assert.ok(Math.abs(short.width - (40 / 448) * 100) < 1e-9, 'a short section is visibly short')
})

test('a row uses one line for one window and two for overlapping ones, so a lone window does not reserve a second line', () => {
  const rows = ribbonRows(parseCorpus(corpus)!)
  assert.deepEqual(rows.map((row) => row.lines), [2, 1])
  for (const row of rows) assert.ok(row.items.every((item) => item.line < row.lines), 'every window sits on a line its row has')
})

test('every ribbon window is a 44 px target, and the lines are one target plus a gap apart so no two targets touch', () => {
  assert.equal(RIBBON_TARGET, 44, 'spec 8.2: touch targets are at least 44 x 44')
  assert.ok(RIBBON_GAP >= 8)
  assert.equal(ribbonTop(0), 0)
  assert.equal(ribbonTop(1), RIBBON_TARGET + RIBBON_GAP)
  assert.ok(ribbonTop(1) - ribbonTop(0) >= RIBBON_TARGET + RIBBON_GAP, 'the second line starts after the first target and the gap')
  assert.equal(ribbonHeight(1), RIBBON_TARGET, 'one line is exactly one target tall')
  assert.equal(ribbonHeight(2), 2 * RIBBON_TARGET + RIBBON_GAP, 'two lines: two targets and the gap between')
  assert.equal(ribbonHeight(0), RIBBON_TARGET, 'a row always has room for one target')
})

test('highlighting marks words by stem, so a question about `embedding` lights `Embeddings` too', () => {
  const stems = new Set(analyze('embedding'))
  const segments = highlightSegments('Embeddings and embedding models.', stems)
  assert.deepEqual(
    segments.filter((s) => s.hit).map((s) => s.text),
    ['Embeddings', 'embedding'],
  )
  assert.equal(segments.map((s) => s.text).join(''), 'Embeddings and embedding models.', 'nothing is lost or reordered')
  assert.deepEqual(highlightSegments('no terms here', new Set()), [{ text: 'no terms here', hit: false }])
})

test('the explorer shows what the engine computes: the same index, the same ranking, the same per-term parts', async () => {
  const parsed = parseCorpus(corpus)!
  const engine = new RetrievalEngine(parsed)

  // The stats are the engine's own, with the window the corpus was cut at.
  const stats = indexStats(parsed, engine.stats)
  assert.equal(stats.chunks, 3)
  assert.equal(stats.terms, engine.index.postings.size)
  assert.equal(stats.window, 256)
  assert.equal(stats.buildMs, engine.stats.buildMs)

  // The term table is the index's; its heading words are in it (the engine indexes them with every window).
  const rows = termTable(engine.index)
  assert.ok(rows.some((row) => row.term === 'pgvector'))
  assert.ok(rows.some((row) => row.term === analyze('agentic')[0]), 'heading words are indexed too')
  const common = filterTerms(rows, '', 'common', 5)
  assert.ok(common.length > 0 && common.length <= 5)
  assert.ok(common.every((row, i) => i === 0 || common[i - 1].df >= row.df))
  const rare = filterTerms(rows, '', 'rare', 5)
  assert.ok(rare.every((row, i) => i === 0 || rare[i - 1].df <= row.df))
  assert.deepEqual(filterTerms(rows, 'pg', 'common').map((row) => row.term), ['pgvector'])
  assert.deepEqual(filterTerms(rows, 'zzz', 'common'), [])

  // A real search through the engine, then the explanation the page prints for each hit.
  const result = await engine.search('What is pgvector?', { mode: 'bm25', topK: 5 })
  assert.equal(result.hits[0].chunkId, 'service-retrieval.0')
  const asked = analyzeQuery('What is pgvector?')
  const index = engine.corpus.chunks.findIndex((c) => c.id === result.hits[0].chunkId)
  const why = explainBm25(engine.index, index, asked.stems)
  assert.equal(why.length, 1)
  assert.equal(why[0].stem, 'pgvector')
  assert.ok(Math.abs(why[0].score - result.hits[0].bm25) < 1e-3, 'one matching word: its part is the whole raw score')

  // The cited sentence is the engine's evidence, cut from the window text.
  assert.equal(citedSentence(result.hits[0]), 'Chunks use pgvector HNSW indexing for retrieval.')
  assert.equal(citedSentence({ text: 'abc', evidence: null }), null)
})

test('a snippet is cut around the first match at word boundaries and says what it left out', () => {
  const text = 'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega pgvector rounds out the very long text that follows it for a while yet.'
  const stems = new Set(analyze('pgvector'))
  const short = snippet(text, stems, 60)
  assert.ok(short.text.includes('pgvector'))
  assert.ok(short.text.length < text.length)
  assert.equal(short.before, true)
  assert.equal(short.after, true)
  assert.ok(!/^\S*$/.test(short.text) && !short.text.startsWith('lpha'), 'cut at a word boundary')
  const none = snippet(text, new Set(), 40)
  assert.equal(none.before, false)
  assert.ok(none.text.startsWith('Alpha'))
  assert.deepEqual(snippet('tiny', new Set()), { text: 'tiny', before: false, after: false })
})

test('stage times print as the home panel prints them: a stage the clock cannot resolve reads "<0.1 ms", never "0 ms"', async () => {
  assert.deepEqual(
    stageTimes([
      { name: 'tokenize', ms: 0.12 },
      { name: 'embed (or BM25)', ms: 0 },
      { name: 'score', ms: 0.019 },
      { name: 'rerank', ms: 0.2 },
      { name: 'cite', ms: 5.2 },
      { name: 'warm', ms: 412 },
    ]),
    [
      { name: 'tokenize', time: '0.1 ms' },
      { name: 'embed (or BM25)', time: '<0.1 ms' },
      { name: 'score', time: '<0.1 ms' },
      { name: 'rerank', time: '0.2 ms' },
      { name: 'cite', time: '5.2 ms' },
      { name: 'warm', time: '412 ms' },
    ],
  )
  // One formatter for both pages: the same search cannot read differently on / and on /experiments/.
  for (const ms of [0, 0.004, 0.049, 0.05, 1.46, 9.96, 10, 14.4]) assert.equal(stageTimes([{ name: 'x', ms }])[0].time, fmtMs(ms))

  // A real search through the engine, whatever the clock reads on this machine: every stage is printed, none as a bare zero.
  const engine = new RetrievalEngine(parseCorpus(corpus)!)
  const result = await engine.search('What is pgvector?', { mode: 'bm25', topK: 5 })
  const printed = stageTimes(result.stages)
  assert.deepEqual(printed.map((stage) => stage.name), [...STAGE_NAMES])
  for (const stage of printed) assert.doesNotMatch(stage.time, /^0(\.0)? ms$/)
})
