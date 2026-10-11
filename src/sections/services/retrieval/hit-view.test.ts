import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RichHit } from '../../../lib/retrieval/types.ts'
import { citeNeeds, citedPart, citedSentence, whereLabel } from './hit-view.ts'

const text = 'Heading line\nFirst sentence here is long enough. Second sentence is the cited one for sure.\nA plain caption goes here.'
const hit = {
  chunkId: 'service-retrieval.1',
  anchor: 'service-retrieval',
  text,
  bm25: 2.3,
  window: { start: 192, end: 448 },
  rank: 1,
  mode: 'bm25',
  tokens: 40,
  parts: [
    { label: 'Service 01', from: 0, to: 12, kind: 'label' },
    { label: 'Service 01 · Peer explanation', from: 13, to: 91, depth: 'peer' },
    { label: 'Service 01 · In plain words', from: 92, to: text.length, kind: 'plain' },
  ],
  evidence: { from: 13 + 40, to: 91, part: 1 },
  matched: [],
  asked: 1,
  contributions: [],
  context: 'Agentic RAG Document Intelligence',
  section: { id: 'service-retrieval', title: 'Service 01', tokens: 607, windows: [], index: 0 },
} as unknown as RichHit

test('the cited part, its label and its sentence come from the evidence', () => {
  assert.equal(citedPart(hit).label, 'Service 01 · Peer explanation')
  assert.equal(whereLabel(hit), 'Service 01 · Peer explanation')
  assert.equal(citedSentence(hit), text.slice(53, 91))
})

test('with no evidence the first part and the first words are used', () => {
  const none = { ...hit, evidence: null } as RichHit
  assert.equal(whereLabel(none), 'Service 01')
  assert.equal(citedSentence(none), text.slice(0, 140))
  const bare = { ...hit, evidence: null, parts: [] } as RichHit
  assert.equal(whereLabel(bare), 'service-retrieval.1')
})

test('a citation says what the page must switch on first', () => {
  assert.deepEqual(citeNeeds(hit, { depth: '30s', plain: true }), { depth: 'peer', plain: false })
  assert.deepEqual(citeNeeds(hit, { depth: 'peer', plain: true }), { depth: null, plain: false })
  const plainHit = { ...hit, evidence: { from: 92, to: text.length, part: 2 } } as RichHit
  assert.deepEqual(citeNeeds(plainHit, { depth: 'engineer', plain: false }), { depth: null, plain: true })
  assert.deepEqual(citeNeeds(plainHit, { depth: 'engineer', plain: true }), { depth: null, plain: false })
})
