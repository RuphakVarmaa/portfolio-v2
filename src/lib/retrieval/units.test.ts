import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildCorpus } from './corpus.ts'
import { SECTIONS, pageRecords } from './page-records.ts'
import { MIN_UNIT_WORDS, embedUnits, unitInput } from './units.ts'
import { parseVocab } from './wordpiece.ts'

const vocab = parseVocab(readFileSync(new URL('../../../public/models/minilm/vocab.txt', import.meta.url), 'utf8'))
const corpus = buildCorpus({ sections: SECTIONS, records: pageRecords(), vocab })
const units = embedUnits(corpus)

test('unitInput puts the section heading in front of the element; no heading leaves the element alone', () => {
  assert.equal(unitInput('Multi-Tenant RBAC Platform', 'Queries were taking 340 ms.'), 'Multi-Tenant RBAC Platform: Queries were taking 340 ms.')
  assert.equal(unitInput('', 'text'), 'text')
})

test('every unit is a real element of a window: ids, indexes and inputs agree with the corpus', () => {
  assert.ok(units.length > corpus.chunks.length, 'many elements per window')
  const seen = new Set<string>()
  const context = new Map(corpus.sections.map((section) => [section.id, section.context]))
  for (const unit of units) {
    assert.ok(!seen.has(unit.id), `duplicate unit id ${unit.id}`)
    seen.add(unit.id)
    const chunk = corpus.chunks[unit.chunk]
    const part = chunk.parts[unit.part]
    assert.equal(unit.id, `${chunk.id}#${unit.part}`)
    assert.notEqual(part.kind, 'label', 'a heading is not something a question is about')
    const text = chunk.text.slice(part.from, part.to).trim()
    assert.ok(text.split(/\s+/).length >= MIN_UNIT_WORDS)
    assert.equal(unit.input, `${context.get(chunk.sectionId)}: ${text}`)
  }
})

test('units come in reading order, chunk by chunk and part by part', () => {
  for (let i = 1; i < units.length; i++) {
    const [a, b] = [units[i - 1], units[i]]
    assert.ok(b.chunk > a.chunk || (b.chunk === a.chunk && b.part > a.part), `${a.id} then ${b.id}`)
  }
})

test('tags and one- or two-word parts are left out; the explanations and the honest caption are in', () => {
  const texts = units.map((unit) => unit.input)
  assert.ok(!texts.some((input) => /: ingest$/.test(input)), 'the schematic part "ingest" is a tag')
  assert.ok(!texts.some((input) => /: Decisions$/.test(input)), 'a work-trace label is a tag')
  assert.ok(texts.some((input) => input.includes('pgvector with HNSW indexing')))
  assert.ok(texts.some((input) => input.includes('256-wordpiece windows with 64 overlap')))
})

test('the same corpus always gives the same units (the build and the browser must agree)', () => {
  assert.deepEqual(embedUnits(corpus), units)
  assert.deepEqual(embedUnits(JSON.parse(JSON.stringify(corpus))), units)
})

test('a corpus without sections or chunks has nothing to embed', () => {
  assert.deepEqual(embedUnits({ chunks: [], sections: [] }), [])
})
