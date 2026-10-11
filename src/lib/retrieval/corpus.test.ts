import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { certificationLines, educationLine, skillLines } from '../../data/copy.ts'
import { experience, profile, projects } from '../../data/portfolio.ts'
import { OVERLAP, STRIDE, WINDOW } from './chunker.ts'
import { buildCorpus, fnv1a, partText, serializeCorpus, stableStringify, type Corpus, type PageRecord } from './corpus.ts'
import { SECTIONS, pageRecords } from './page-records.ts'
import { parseVocab, tokenize } from './wordpiece.ts'

const vocab = parseVocab(readFileSync(new URL('../../../public/models/minilm/vocab.txt', import.meta.url), 'utf8'))
const records = pageRecords()
const corpus = buildCorpus({ sections: SECTIONS, records, vocab })
const everything = corpus.chunks.map((chunk) => chunk.text).join('\n')

test('the corpus is deterministic: the same input is the same bytes, whatever the key order', () => {
  const again = buildCorpus({ sections: SECTIONS, records: pageRecords(), vocab })
  assert.equal(serializeCorpus(again), serializeCorpus(corpus))
  assert.equal(stableStringify({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] } }), '{"a":{"c":[{"y":2,"z":1}],"d":1},"b":1}\n')
  assert.equal(stableStringify({ keep: 1, drop: undefined }), '{"keep":1}\n')
  assert.ok(serializeCorpus(corpus).endsWith('}\n'))
})

test('format: 256-wordpiece windows, stride 192, overlap 64, counted in wordpieces', () => {
  assert.equal(corpus.model, 'bm25+minilm')
  assert.deepEqual([corpus.window, corpus.stride, corpus.overlap], [256, 192, 64])
  assert.deepEqual([WINDOW, STRIDE, OVERLAP], [256, 192, 64])
  assert.equal(corpus.tokenizer, 'wordpiece')
  assert.ok(corpus.chunks.length >= 11)
})

test('every home-page section with text is there, in reading order, and chunk ids are unique', () => {
  assert.deepEqual(corpus.sections.map((s) => s.id), SECTIONS.map((s) => s.id))
  assert.deepEqual(corpus.sections.map((s) => s.id), [
    'control-room', 'services', 'service-retrieval', 'service-vision', 'service-policy', 'service-review',
    'chaos-lab', 'deploy-history', 'manifest', 'contact', 'colophon',
  ])
  assert.equal(new Set(corpus.chunks.map((c) => c.id)).size, corpus.chunks.length)
  // Chunks follow the sections' order, and each section's chunks are numbered from 0.
  for (const section of corpus.sections) {
    const own = corpus.chunks.filter((c) => c.sectionId === section.id)
    assert.equal(own.length, section.windows)
    assert.deepEqual(own.map((c) => c.id), own.map((_, i) => `${section.id}.${i}`))
    for (const chunk of own) assert.equal(chunk.anchor, section.anchor)
  }
})

test('no window is over 256 wordpieces, none crosses a section, and windows overlap by about 64', () => {
  for (const section of corpus.sections) {
    const own = corpus.chunks.filter((c) => c.sectionId === section.id)
    assert.equal(own[0].start, 0)
    assert.equal(own[own.length - 1].end, section.tokens, `${section.id}: the last window ends at the last token`)
    own.forEach((chunk, i) => {
      assert.ok(chunk.tokens <= WINDOW, `${chunk.id}: ${chunk.tokens} tokens`)
      assert.equal(chunk.end - chunk.start, chunk.tokens)
      assert.equal(tokenize(chunk.text, vocab).length, chunk.tokens, `${chunk.id}: tokens recount from the text`)
      if (i > 0) {
        const overlap = own[i - 1].end - chunk.start
        assert.ok(overlap >= OVERLAP - 8 && overlap <= OVERLAP + 8, `${chunk.id}: overlap ${overlap}`)
      }
    })
  }
  assert.ok(corpus.chunks.some((c) => c.tokens > 200), 'at least one section is long enough to need several windows')
  assert.ok(corpus.sections.some((s) => s.windows > 1))
})

test('parts say where each stretch of a window came from, and tile its text', () => {
  for (const chunk of corpus.chunks) {
    assert.ok(chunk.parts.length > 0)
    let previousEnd = 0
    for (const part of chunk.parts) {
      assert.ok(part.from >= previousEnd && part.to > part.from && part.to <= chunk.text.length, `${chunk.id}`)
      assert.ok(part.label.length > 0)
      previousEnd = part.to
    }
    assert.equal(chunk.parts[0].from, 0)
    assert.equal(chunk.parts[chunk.parts.length - 1].to, chunk.text.length)
    assert.equal(chunk.hash, fnv1a(chunk.text))
  }
  // A window that starts inside a page element says so, and then only its first part is flagged at the start.
  const cut = corpus.chunks.flatMap((c) => c.parts.filter((p) => p.cut))
  assert.ok(cut.length > 0)
  const retrieval = corpus.chunks.find((c) => c.id === 'service-retrieval.1')
  assert.ok(retrieval)
  assert.ok(retrieval.parts.some((p) => p.depth === 'engineer' || p.depth === 'peer'))
})

test('every record of the page is in the corpus, first and last characters included', () => {
  for (const record of records) {
    const text = record.text
    assert.ok(everything.includes(text.slice(0, Math.min(24, text.length))), `missing start of: ${text}`)
    assert.ok(everything.includes(text.slice(-Math.min(24, text.length))), `missing end of: ${text}`)
  }
})

test('facts come straight from the data files: titles, metrics, stacks, roles, periods, skills, education, certifications', () => {
  for (const project of projects) {
    assert.ok(everything.includes(project.title), project.title)
    assert.ok(everything.includes(project.headlineMetric), project.headlineMetric)
    for (const metric of project.metrics) assert.ok(everything.includes(`${metric.value} ${metric.label}`), metric.label)
    assert.ok(everything.includes(project.stack.join(' · ')), project.title)
  }
  for (const entry of experience) {
    for (const value of [entry.role, entry.organization, entry.period]) assert.ok(everything.includes(value), value)
    if (entry.proof) assert.ok(everything.includes(entry.proof), entry.proof)
  }
  for (const line of [...skillLines(), ...certificationLines(), educationLine()]) assert.ok(everything.includes(line), line)
  assert.ok(everything.includes(profile.email))
})

test('the phone number is on the page but never in this public file', () => {
  const json = serializeCorpus(corpus).replace(/[\s\-+().]/g, '')
  assert.ok(!json.includes(profile.phone.replace(/\D/g, '')))
  assert.ok(!everything.includes(profile.phone))
})

test('only prose is indexed: no chips, placeholders or placeholders for dynamic text', () => {
  for (const chrome of ['What broke in the RBAC project?', 'How was latency variance reduced?', 'Which cloud did Neural Inverse use?', 'What did Ruphak do with pgvector?']) {
    assert.ok(!everything.includes(chrome), chrome)
  }
  assert.ok(!/undefined|\[object|NaN/.test(everything))
})

test('the honest caption with the 256-versus-512 sentence is in the corpus too', () => {
  assert.ok(everything.includes('256-wordpiece windows with 64 overlap'))
  assert.ok(everything.includes('512-token windows'))
})

test('explanation depths are tagged, plain captions are marked, labels are marked', () => {
  const parts = corpus.chunks.flatMap((c) => c.parts)
  for (const depth of ['30s', 'engineer', 'peer']) assert.ok(parts.some((p) => p.depth === depth), depth)
  assert.ok(parts.some((p) => p.kind === 'plain'))
  assert.ok(parts.some((p) => p.kind === 'label'))
  const groups = new Set(parts.map((p) => p.group).filter(Boolean))
  assert.ok([...groups].some((g) => g?.startsWith('release:')))
  assert.ok([...groups].some((g) => g?.includes(':trace:')))
})

test('without the vocabulary the corpus still builds, counts words, and says so', () => {
  const fallback = buildCorpus({ sections: SECTIONS, records, vocab: null })
  assert.equal(fallback.tokenizer, 'words')
  assert.ok(fallback.chunks.length >= 11)
  for (const chunk of fallback.chunks) assert.ok(chunk.tokens <= WINDOW)
})

test('a section with no records is left out; a blank record is ignored; partText slices a part', () => {
  const sections = [
    { id: 'a', anchor: 'a', title: 'A', context: 'A' },
    { id: 'b', anchor: 'b', title: 'B', context: 'B' },
  ]
  const custom: PageRecord[] = [
    { sectionId: 'a', anchor: 'a', label: 'One', text: 'Hello world, this is a test.' },
    { sectionId: 'a', anchor: 'a', label: 'Two', text: '   ' },
    { sectionId: 'a', anchor: 'a', label: 'Three', text: 'Second line.' },
  ]
  const small: Corpus = buildCorpus({ sections, records: custom, vocab })
  assert.deepEqual(small.sections.map((s) => s.id), ['a'])
  assert.equal(small.chunks.length, 1)
  assert.equal(small.chunks[0].text, 'Hello world, this is a test.\nSecond line.')
  assert.deepEqual(small.chunks[0].parts.map((p) => partText(small.chunks[0], p)), ['Hello world, this is a test.', 'Second line.'])
  assert.deepEqual(small.assets, { vocab: null, encoder: null, runtime: null })
})

test('fnv1a is the 32-bit FNV-1a hash', () => {
  assert.equal(fnv1a(''), '811c9dc5')
  assert.equal(fnv1a('a'), 'e40c292c')
  assert.equal(fnv1a('foobar'), 'bf9cf968')
})
