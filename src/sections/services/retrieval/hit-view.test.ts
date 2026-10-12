import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RichHit } from '../../../lib/retrieval/types.ts'
import { PLAIN_BUDGET, WHOLE_LIMIT, citeNeeds, citedExcerpt, citedPart, citedSentence, passageRange, shownParts, showsInternals, whereLabel, type ShownPart } from './hit-view.ts'

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

// ---- the stretch a card shows: whole words, with the cut as a mark in the line --------------------------------------------

/** A window that began on "% retrieval" (the page says "87% retrieval"): shown from the second word. */
const broken = (() => {
  const body = '% retrieval precision, sub-2 s p95, and a 70% reduction in manual document analysis time.\nA second element, whole.'
  const cut = body.indexOf('\n')
  return {
    ...hit,
    text: body,
    parts: [
      { label: 'Service 01 · Engineer explanation', from: 0, to: cut, depth: 'engineer', cut: 'start' },
      { label: 'Service 01 · In plain words', from: cut + 1, to: body.length, kind: 'plain', cut: 'end' },
    ],
    shown: { from: 2, to: body.length },
    evidence: { from: 0, to: cut, part: 0 },
  } as unknown as RichHit
})()

test('the parts of a card are clipped to the stretch that starts on a whole word, and say where the page element goes on', () => {
  const [first, second] = shownParts(broken)
  assert.deepEqual([first.from, first.to, first.cutStart, first.cutEnd], [2, broken.text.indexOf('\n'), true, false])
  assert.equal(broken.text.slice(first.from, first.to), 'retrieval precision, sub-2 s p95, and a 70% reduction in manual document analysis time.')
  assert.deepEqual([second.cutStart, second.cutEnd], [false, true])
  // With nothing to leave off, the parts are the window's own.
  const whole = shownParts(hit)
  assert.deepEqual(whole.map((entry) => [entry.from, entry.to]), hit.parts.map((part) => [part.from, part.to]))
  assert.deepEqual(whole.map((entry) => entry.index), [0, 1, 2])
})

test('an element that is entirely in the broken end is not listed, and the next element then starts cleanly', () => {
  const tiny = { ...hit, text: '%\nNext element is here.', parts: [{ label: 'a', from: 0, to: 1, cut: 'start' }, { label: 'b', from: 2, to: 22 }], shown: { from: 2, to: 22 } } as unknown as RichHit
  const parts = shownParts(tiny)
  assert.deepEqual(parts.map((entry) => entry.index), [1])
  assert.equal(parts[0].cutStart, false, 'no mark: the page element begins where the card does')
})

test('the cited sentence is shown from the same word, with whether the window cut it', () => {
  const excerpt = citedExcerpt(broken)
  assert.equal(excerpt.text, 'retrieval precision, sub-2 s p95, and a 70% reduction in manual document analysis time.')
  assert.deepEqual([excerpt.cutStart, excerpt.cutEnd], [true, false])
  assert.equal(citedSentence(broken), excerpt.text, 'the page is searched for what the card shows')
  // A sentence the window does not cut is not marked.
  const clean = citedExcerpt(hit)
  assert.deepEqual([clean.cutStart, clean.cutEnd], [false, false])
  // A sentence at the window's last edge, in an element that goes on, is marked at its end.
  const tail = { ...broken, evidence: { from: 91, to: broken.text.length, part: 1 } } as RichHit
  assert.deepEqual([citedExcerpt(tail).cutStart, citedExcerpt(tail).cutEnd], [false, true])
})

test('with no sentence to cite the card shows the first words of the stretch it shows', () => {
  const none = { ...broken, evidence: null } as RichHit
  assert.equal(citedExcerpt(none).text, broken.text.slice(2), 'a short window is all there')
  assert.equal(citedExcerpt(none).cutStart, true)
  assert.equal(citedExcerpt(none).cutEnd, false)
  const long = { ...none, text: '% ' + 'word '.repeat(60), shown: { from: 2, to: 302 }, parts: [{ label: 'a', from: 0, to: 302, cut: 'start' }] } as unknown as RichHit
  assert.equal(citedExcerpt(long).text.length, 140)
  assert.equal(citedExcerpt(long).cutEnd, true, 'it is cut at 140 characters')
})

// ---- how much of a window a card shows, by depth --------------------------------------------------------------------

/** Page elements of the given sizes (characters), optionally in groups; the cut flags are not needed here. */
function elements(sizes: number[], groups: Array<string | undefined> = []): ShownPart[] {
  let at = 0
  return sizes.map((size, index) => {
    const entry = { index, part: { label: `p${index}`, from: at, to: at + size, ...(groups[index] ? { group: groups[index] } : {}) }, from: at, to: at + size, cutStart: false, cutEnd: false }
    at += size + 1
    return entry
  })
}

test('Engineer and Peer: a window of five elements or fewer is shown whole, a longer one as the cited element and one on each side', () => {
  assert.equal(WHOLE_LIMIT, 5)
  assert.deepEqual(passageRange(elements([50, 50, 50, 50, 50]), 2, true, false), { first: 0, last: 4, expandable: false })
  assert.deepEqual(passageRange(elements(Array(24).fill(40)), 11, true, false), { first: 10, last: 12, expandable: true })
  assert.deepEqual(passageRange(elements(Array(24).fill(40)), 0, true, false), { first: 0, last: 1, expandable: true }, 'at the start of the window')
  assert.deepEqual(passageRange(elements(Array(24).fill(40)), 23, true, false), { first: 22, last: 23, expandable: true }, 'at the end')
  assert.deepEqual(passageRange(elements(Array(24).fill(40)), 11, true, true), { first: 0, last: 23, expandable: true }, 'show all')
})

test('30-second: an element longer than the budget is shown alone, whole: the exact paragraph that was found', () => {
  assert.equal(PLAIN_BUDGET, 480)
  const four = elements([90, 466, 150, 330])
  assert.deepEqual(passageRange(four, 1, false, false), { first: 1, last: 1, expandable: true })
  assert.deepEqual(passageRange(four, 1, false, true), { first: 0, last: 3, expandable: true })
})

test('30-second: a short element keeps its neighbours while the lot fits the budget, the one before it first', () => {
  const lines = elements([30, 40, 60, 60, 60, 300, 20])
  // 60 + 60 (before) + 60 (after) + 40 + 30 ... = until the next one (300) would pass 480.
  const range = passageRange(lines, 3, false, false)
  const size = lines.slice(range.first, range.last + 1).reduce((sum, entry) => sum + (entry.to - entry.from), 0)
  assert.ok(size <= PLAIN_BUDGET)
  assert.ok(range.first <= 3 && range.last >= 3)
  assert.ok(range.last - range.first + 1 >= 3, 'the neighbours are there')
  assert.equal(range.expandable, true)
  // Everything fits: it is shown whole and there is nothing to expand.
  assert.deepEqual(passageRange(elements([40, 40, 40]), 1, false, false), { first: 0, last: 2, expandable: false })
})

test('30-second: an element that belongs to a group (a release, a work-trace entry) is shown with the whole group, and nothing beside it', () => {
  const page = elements([120, 8, 40, 14, 20, 165, 24, 50, 130, 60], [undefined, 'release:v2022.09', 'release:v2022.09', 'release:v2022.09', 'release:v2022.09', 'release:v2022.09', 'release:v2022.09', 'release:v2022.09', undefined, undefined])
  assert.deepEqual(passageRange(page, 5, false, false), { first: 1, last: 7, expandable: true })
  assert.deepEqual(passageRange(page, 5, true, false), { first: 4, last: 6, expandable: true }, 'Engineer keeps its neighbours')
})

test('an empty or one-element window has nothing to expand, and an out-of-range index is clamped', () => {
  assert.deepEqual(passageRange([], 0, false, false), { first: 0, last: -1, expandable: false })
  assert.deepEqual(passageRange(elements([200]), 0, false, false), { first: 0, last: 0, expandable: false })
  assert.deepEqual(passageRange(elements([300, 300]), 9, false, false), { first: 1, last: 1, expandable: true })
})

test('the engineer\'s rows belong to Engineer and Peer, not to the 30-second depth', () => {
  assert.equal(showsInternals('30s'), false)
  assert.equal(showsInternals('engineer'), true)
  assert.equal(showsInternals('peer'), true)
})
