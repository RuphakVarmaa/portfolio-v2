import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { analyze } from './analyze.ts'
import { buildCorpus, type CorpusChunk } from './corpus.ts'
import { normalize } from './cosine.ts'
import { BM25_FLOOR, COSINE_FLOOR, MODEL_NOT_LOADED, RetrievalEngine, STAGE_NAMES, pickEvidence } from './engine.ts'
import type { SentenceEncoder } from './embed.ts'
import { SECTIONS, pageRecords } from './page-records.ts'
import { embedUnits } from './units.ts'
import { parseVocab, type Encoded } from './wordpiece.ts'

const vocab = parseVocab(readFileSync(new URL('../../../public/models/minilm/vocab.txt', import.meta.url), 'utf8'))
const corpus = buildCorpus({ sections: SECTIONS, records: pageRecords(), vocab })
const engine = new RetrievalEngine(corpus)

const evidenceText = (hit: { text: string; evidence: { from: number; to: number } | null }) => (hit.evidence ? hit.text.slice(hit.evidence.from, hit.evidence.to) : '')

test('acceptance: "pgvector" finds the retrieval panel, cites a sentence about pgvector, and the anchor is the panel', async () => {
  const result = await engine.search('pgvector', { mode: 'bm25', topK: 5 })
  const [first] = result.hits
  assert.equal(first.rank, 1)
  assert.equal(first.mode, 'bm25')
  assert.equal(first.anchor, 'service-retrieval')
  assert.match(first.text, /pgvector/)
  assert.match(first.text, /HNSW/)
  assert.match(evidenceText(first), /pgvector/)
  assert.ok(first.bm25 >= BM25_FLOOR)
  assert.equal(first.cosine, undefined)
  // The whole retrieval panel is what answers; the manifest's skills list may follow.
  assert.ok(result.hits.slice(0, 3).every((h) => h.anchor === 'service-retrieval'))
})

test('the placeholder question reaches the same passage as the bare word: the author\'s name does not drag in the contact section', async () => {
  const asked = await engine.search('What did Ruphak do with pgvector?', { mode: 'bm25', topK: 5 })
  const bare = await engine.search('pgvector', { mode: 'bm25', topK: 5 })
  assert.deepEqual(asked.words, ['pgvector'])
  assert.deepEqual(asked.hits.map((h) => h.chunkId), bare.hits.map((h) => h.chunkId))
})

test('the three suggested questions find the right panel, and cite the right sentence', async () => {
  const broke = (await engine.search('What broke in the RBAC project?', { mode: 'bm25', topK: 5 })).hits[0]
  assert.equal(broke.anchor, 'service-policy')
  assert.match(broke.parts[broke.evidence?.part ?? 0].label, /What broke/)
  assert.match(evidenceText(broke), /N\+1|340/)
  assert.deepEqual(broke.matched, ['broke', 'rbac'])

  const variance = (await engine.search('How was latency variance reduced?', { mode: 'bm25', topK: 5 })).hits[0]
  assert.equal(variance.anchor, 'service-vision')
  assert.match(evidenceText(variance), /reduced latency variance by 40%/)
  assert.equal(variance.matched.length, 3)

  const cloud = (await engine.search('Which cloud did Neural Inverse use?', { mode: 'bm25', topK: 5 })).hits[0]
  assert.equal(cloud.anchor, 'deploy-history')
  // The note never repeats the name; the group (role, organization, period, note) is what matched.
  assert.match(evidenceText(cloud), /Azure Cognitive Services and Azure SQL/)
})

test('keyword questions land where a visitor would expect', async () => {
  const where = async (q: string) => (await engine.search(q, { mode: 'bm25', topK: 1 })).hits[0]?.anchor
  assert.equal(await where('semgrep'), 'service-review')
  assert.equal(await where('email'), 'contact')
  assert.equal(await where('leetcode rating'), 'deploy-history')
  assert.equal(await where('AZ-900'), 'deploy-history')
  assert.equal(await where('who built this site'), 'colophon')
  assert.equal(await where('why 256 wordpiece windows'), 'service-retrieval')
  assert.equal(await where('how do tabs elect a leader'), 'chaos-lab')
})

test('the five stages are real, named as the panel names them, and add up', async () => {
  const seen: string[] = []
  const result = await engine.search('pgvector', { mode: 'bm25', topK: 5, onStage: (stage) => seen.push(stage.name) })
  assert.deepEqual(result.stages.map((s) => s.name), [...STAGE_NAMES])
  assert.deepEqual(seen, [...STAGE_NAMES])
  assert.deepEqual([...STAGE_NAMES], ['tokenize', 'embed (or BM25)', 'score', 'rerank', 'cite'])
  for (const stage of result.stages) assert.ok(Number.isFinite(stage.ms) && stage.ms >= 0)
  assert.ok(Math.abs(result.totalMs - result.stages.reduce((sum, s) => sum + s.ms, 0)) < 0.01)
})

test('stage timings come from the clock the engine is given (nothing is hard-coded)', async () => {
  let t = 0
  const ticking = new RetrievalEngine(corpus, () => (t += 2.5))
  const result = await ticking.search('pgvector', { mode: 'bm25', topK: 3 })
  // Each stage reads the clock twice (end, then restart): every stage is exactly one tick long.
  for (const stage of result.stages) assert.equal(stage.ms, 2.5)
  assert.ok(ticking.stats.buildMs > 0)
})

test('the relevance floor: nothing below BM25 0.5, and nonsense or stop words find nothing', async () => {
  const result = await engine.search('projects', { mode: 'bm25', topK: 20 })
  assert.ok(result.hits.length > 0 && result.hits.every((h) => h.bm25 >= BM25_FLOOR))
  assert.equal(result.candidates >= result.hits.length, true)
  for (const q of ['zzzzqx', 'the of and', '', '   ', '???']) {
    const none = await engine.search(q, { mode: 'bm25', topK: 5 })
    assert.deepEqual(none.hits, [], q)
    assert.equal(none.stages.length, 5)
  }
})

test('topK is respected, ranks are 1..n, and the same question always gives the same answer', async () => {
  const a = await engine.search('windows', { mode: 'bm25', topK: 2 })
  const b = await engine.search('windows', { mode: 'bm25', topK: 2 })
  assert.equal(a.hits.length, 2)
  assert.deepEqual(a.hits.map((h) => h.rank), [1, 2])
  assert.deepEqual(a.hits.map((h) => [h.chunkId, h.bm25]), b.hits.map((h) => [h.chunkId, h.bm25]))
})

test('each hit knows its window, its section and where it sits among the section\'s windows', async () => {
  const result = await engine.search('pgvector', { mode: 'bm25', topK: 5 })
  for (const hit of result.hits) {
    assert.deepEqual(hit.section.windows[hit.section.index], hit.window)
    assert.equal(hit.window.end - hit.window.start, hit.tokens)
    assert.ok(hit.section.tokens >= hit.window.end)
    assert.ok(hit.parts.length > 0)
    assert.equal(hit.context.length > 0, true)
    assert.ok(hit.evidence === null || (hit.evidence.to > hit.evidence.from && hit.evidence.to <= hit.text.length))
    assert.ok(hit.contributions.every((c) => c.score > 0))
    assert.ok(hit.contributions.reduce((sum, c) => sum + c.score, 0) <= hit.bm25 + 0.01)
  }
  const first = result.hits[0]
  assert.ok(first.section.windows.length >= 3, 'the retrieval panel needs several windows')
})

test('the section heading is indexed with every window, so "the RBAC project" finds a window that never says RBAC', async () => {
  const policy = corpus.chunks.filter((c) => c.sectionId === 'service-policy')
  assert.ok(policy.some((c) => !/RBAC/i.test(c.text)), 'precondition: some policy window never repeats the title')
  const result = await engine.search('RBAC', { mode: 'bm25', topK: 10 })
  const ids = new Set(result.hits.map((h) => h.chunkId))
  for (const chunk of policy) assert.ok(ids.has(chunk.id), chunk.id)
})

test('embedding mode needs the model: without it a search says so', async () => {
  await assert.rejects(() => engine.search('pgvector', { mode: 'embed', topK: 5 }), new RegExp(MODEL_NOT_LOADED))
  assert.equal(engine.hasEncoder, false)
})

/** A toy encoder: stems hashed into 32 buckets, unit length. Enough to check the cosine path end to end. */
function toyEncoder(): SentenceEncoder & { vectorOf(text: string): Float32Array } {
  const vectorOf = (text: string): Float32Array => {
    const v = new Float32Array(32)
    for (const stem of analyze(text)) {
      let h = 0
      for (let i = 0; i < stem.length; i++) h = (h * 31 + stem.charCodeAt(i)) >>> 0
      v[h % 32] += 1
    }
    return normalize(v)
  }
  const prepare = (text: string): Encoded => ({ ids: [], attention: [], typeIds: [], pieces: [], truncated: false, text }) as Encoded & { text: string }
  return {
    dim: 32,
    prepare,
    run: async (encoded) => vectorOf((encoded as Encoded & { text: string }).text),
    encode: async (texts) => texts.map(vectorOf),
    vectorOf,
  }
}

test('embedding mode fuses BM25 and cosine, reports both, honours both floors, and names the same five stages', async () => {
  const withModel = new RetrievalEngine(corpus)
  const encoder = toyEncoder()
  const inputs = withModel.inputs()
  withModel.attachEncoder(encoder, inputs.map((item) => encoder.vectorOf(item.input)))
  assert.equal(withModel.hasEncoder, true)
  // Asking with one page element's own encoder input gives its window a cosine of exactly 1 (a window takes the
  // cosine of its nearest element). Pick an element no other window repeats.
  const repeats = new Map<string, number>()
  for (const item of inputs) repeats.set(item.input, (repeats.get(item.input) ?? 0) + 1)
  const target = inputs.find((item) => item.id.startsWith('service-retrieval.1#') && repeats.get(item.input) === 1)
  assert.ok(target)
  const result = await withModel.search(target.input, { mode: 'embed', topK: 5 })
  assert.equal(result.mode, 'embed')
  assert.deepEqual(result.stages.map((s) => s.name), [...STAGE_NAMES])
  assert.ok(result.hits.length > 0)
  assert.ok(result.hits.every((h) => typeof h.cosine === 'number' && typeof h.bm25 === 'number'))
  // Every hit passed at least one of the two floors.
  assert.ok(result.hits.every((h) => (h.cosine as number) >= COSINE_FLOOR || h.bm25 >= BM25_FLOOR))
  // The window holding the element has the highest cosine of all (1); the fused order also weighs BM25, so it need not lead.
  const nearest = [...result.hits].sort((a, b) => (b.cosine as number) - (a.cosine as number))[0]
  assert.equal(nearest.chunkId, 'service-retrieval.1')
  assert.ok(Math.abs((nearest.cosine as number) - 1) < 1e-3)
  assert.match(result.rerank, /fused/)
  withModel.detachEncoder()
  assert.equal(withModel.hasEncoder, false)
  await assert.rejects(() => withModel.search('x', { mode: 'embed', topK: 1 }), new RegExp(MODEL_NOT_LOADED))
})

test('hybrid: the embedding rescues a question BM25 cannot see, and never outranks a strong BM25 match by itself', async () => {
  const withModel = new RetrievalEngine(corpus)
  assert.ok(withModel.inputs().some((item) => item.id.startsWith('colophon.0#')))
  // A vector search that thinks only the elements of colophon.0 are close, and a question with no word the page contains.
  const unit = (i: number) => normalize(Array.from({ length: 4 }, (_, d) => (d === i ? 1 : 0)))
  const vectors = withModel.inputs().map((item) => (item.id.startsWith('colophon.0#') ? unit(0) : unit(3)))
  const encoder: SentenceEncoder = { dim: 4, prepare: () => ({ ids: [], attention: [], typeIds: [], pieces: [], truncated: false }), run: async () => unit(0), encode: async () => [unit(0)] }
  withModel.attachEncoder(encoder, vectors)
  const rescued = await withModel.search('zzzzqx', { mode: 'embed', topK: 5 })
  assert.deepEqual(rescued.hits.map((h) => h.chunkId), ['colophon.0'])
  assert.equal(rescued.hits[0].bm25, 0)
  assert.ok(rescued.hits[0].evidence, 'an embedding-only match still cites a sentence')
  // With a real BM25 match the lexical hit leads, even though the embedding prefers the colophon.
  const mixed = await withModel.search('pgvector', { mode: 'embed', topK: 5 })
  assert.equal(mixed.hits[0].anchor, 'service-retrieval')
  assert.ok(mixed.hits.some((h) => h.chunkId === 'colophon.0'))
})

test('attachEncoder wants one vector per page element, and each input has its section heading in front', () => {
  assert.throws(() => new RetrievalEngine(corpus).attachEncoder(toyEncoder(), []), /One vector per page element/)
  const inputs = engine.inputs()
  const units = embedUnits(corpus)
  assert.equal(inputs.length, units.length)
  const context = new Map(corpus.sections.map((section) => [section.id, section.context]))
  inputs.forEach((item, i) => {
    const chunk = corpus.chunks[units[i].chunk]
    assert.equal(item.id, units[i].id)
    assert.ok(item.input.startsWith(`${context.get(chunk.sectionId)}: `))
  })
})

test('an embedding-only match cites the page element the encoder found nearest, not the first sentence of the window', async () => {
  const withModel = new RetrievalEngine(corpus)
  const inputs = withModel.inputs()
  const units = embedUnits(corpus)
  // The Peer explanation of the vision panel is the element the (fake) encoder points at.
  const at = units.findIndex((unit) => corpus.chunks[unit.chunk].id === 'service-vision.1' && /bounded buffer/.test(unit.input))
  assert.ok(at >= 0)
  const unit = (i: number) => normalize(Array.from({ length: 4 }, (_, d) => (d === i ? 1 : 0)))
  const vectors = inputs.map((_, i) => (i === at ? unit(0) : unit(3)))
  const encoder: SentenceEncoder = { dim: 4, prepare: () => ({ ids: [], attention: [], typeIds: [], pieces: [], truncated: false }), run: async () => unit(0), encode: async () => [unit(0)] }
  withModel.attachEncoder(encoder, vectors)
  const result = await withModel.search('zzzzqx', { mode: 'embed', topK: 3 })
  assert.deepEqual(result.hits.map((h) => h.chunkId), ['service-vision.1'])
  const [hit] = result.hits
  assert.equal(hit.evidence?.part, units[at].part)
  assert.match(evidenceText(hit), /bounded buffer|drop-oldest|Telemetry/)
  assert.ok(Math.abs((hit.cosine as number) - 1) < 1e-3)
})

// ---- pickEvidence on small hand-made chunks ------------------------------------------------------------

function chunkOf(parts: Array<{ text: string; kind?: 'label' | 'plain' | 'text'; group?: string; cut?: 'start' | 'end' | 'both' }>): CorpusChunk {
  let text = ''
  const out: CorpusChunk['parts'] = []
  for (const part of parts) {
    if (text) text += '\n'
    const from = text.length
    text += part.text
    const entry: CorpusChunk['parts'][number] = { label: 'x', from, to: text.length }
    if (part.kind && part.kind !== 'text') entry.kind = part.kind
    if (part.group) entry.group = part.group
    if (part.cut) entry.cut = part.cut
    out.push(entry)
  }
  return { id: 'c.0', sectionId: 'c', anchor: 'c', text, tokens: 0, start: 0, end: 0, hash: '', parts: out }
}
const idf = (stem: string) => ({ cloud: 2, neural: 3, invers: 3, broke: 1.5 })[stem] ?? 1
const textOf = (chunk: CorpusChunk, e: ReturnType<typeof pickEvidence>) => (e ? chunk.text.slice(e.from, e.to) : null)

test('pickEvidence: the sentence with the most question words wins', () => {
  const chunk = chunkOf([{ text: 'Nothing relevant happens here at all. The cloud was Azure for the neural network.' }])
  assert.equal(textOf(chunk, pickEvidence(chunk, new Set(['cloud', 'neural']), idf)), 'The cloud was Azure for the neural network.')
})

test('pickEvidence: a group is matched as one, and a real sentence beats a title or a tag', () => {
  const chunk = chunkOf([
    { text: 'v2022.09', kind: 'label', group: 'g' },
    { text: 'Chief Officer', group: 'g' },
    { text: 'Neural Inverse', group: 'g' },
    { text: 'I architected an automated pipeline on Azure services and led the work.', group: 'g' },
    { text: 'Another release about the cloud with enough words in it.', group: 'h' },
  ])
  const picked = textOf(chunk, pickEvidence(chunk, new Set(['neural', 'invers', 'cloud']), idf))
  assert.equal(picked, 'I architected an automated pipeline on Azure services and led the work.')
})

test('pickEvidence: a label that matches points at the text that follows it', () => {
  const chunk = chunkOf([
    { text: 'What broke', kind: 'label', group: 'trace' },
    { text: 'Queries were taking too long for anyone to enjoy them.', group: 'trace' },
    { text: 'Decisions were made elsewhere in this unrelated section of text.', group: 'other' },
  ])
  assert.equal(textOf(chunk, pickEvidence(chunk, new Set(['broke']), idf)), 'Queries were taking too long for anyone to enjoy them.')
})

test('pickEvidence: a sentence cut off by the window counts half, and with no match it falls back to the first sentence', () => {
  const cut = chunkOf([{ text: 'a fragment of the cloud story that was cut off here. The whole cloud sentence is here intact.', cut: 'start' }])
  assert.equal(textOf(cut, pickEvidence(cut, new Set(['cloud']), idf)), 'The whole cloud sentence is here intact.')
  const none = chunkOf([{ text: 'Title', kind: 'label' }, { text: 'First sentence of the window is here. A second one follows it.' }])
  assert.equal(textOf(none, pickEvidence(none, new Set(['zzz']), idf)), 'First sentence of the window is here.')
  assert.equal(pickEvidence(chunkOf([{ text: 'Only a label', kind: 'label' }]), new Set(['label']), idf), null)
})

test('pickEvidence: when page elements tie, the real sentence beats a list, and the longer sentence beats the earlier one', () => {
  // A one-word question matches all three elements equally; the list comes first on the page.
  const chunk = chunkOf([
    { text: 'Stack Python · LangChain · FastAPI · PostgreSQL · cloud · AWS EC2' },
    { text: 'Cloud.' },
    { text: 'The cloud was Azure.' },
    { text: 'Chunks live in the cloud, where the index does the nearest-neighbour pass over them all.' },
  ])
  const picked = textOf(chunk, pickEvidence(chunk, new Set(['cloud']), idf))
  assert.equal(picked, 'Chunks live in the cloud, where the index does the nearest-neighbour pass over them all.')
  // A real sentence still beats a short tag even when the tag is first.
  const tag = chunkOf([{ text: 'Cloud' }, { text: 'I moved the whole thing to the cloud last year.' }])
  assert.equal(textOf(tag, pickEvidence(tag, new Set(['cloud']), idf)), 'I moved the whole thing to the cloud last year.')
})
