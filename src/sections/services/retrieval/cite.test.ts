import assert from 'node:assert/strict'
import { test } from 'node:test'
import { expandToSentence, findSquashed } from './cite.ts'

/** The text a match covers, read back out of the pieces. */
function covered(texts: string[], match: NonNullable<ReturnType<typeof findSquashed>>): string {
  if (match.startText === match.endText) return texts[match.startText].slice(match.startOffset, match.endOffset)
  return [
    texts[match.startText].slice(match.startOffset),
    ...texts.slice(match.startText + 1, match.endText),
    texts[match.endText].slice(0, match.endOffset),
  ].join('')
}

test('finds a sentence inside one text node, offsets included', () => {
  const texts = ['Intro. ', 'Chunks are 512-token sliding windows; pgvector with HNSW indexing does the pass.', ' Outro.']
  const match = findSquashed(texts, 'pgvector with HNSW indexing does the pass.')
  assert.ok(match)
  assert.equal(match.startText, 1)
  assert.equal(match.endText, 1)
  assert.equal(covered(texts, match), 'pgvector with HNSW indexing does the pass.')
})

test('whitespace differences do not matter: the page runs a metric\'s value into its label', () => {
  const texts = ['87%', 'retrieval precision', '100K', 'token corpora']
  const match = findSquashed(texts, '87% retrieval precision')
  assert.ok(match)
  assert.deepEqual([match.startText, match.startOffset, match.endText, match.endOffset], [0, 0, 1, 19])
  assert.equal(covered(texts, match), '87%retrieval precision')
})

test('a sentence split across inline markup spans several nodes', () => {
  const texts = ['Tenant isolation is ', 'enforced twice', ': the JWT carries the tenant claim.']
  const match = findSquashed(texts, 'Tenant isolation is enforced twice: the JWT carries the tenant claim.')
  assert.ok(match)
  assert.deepEqual([match.startText, match.endText], [0, 2])
  assert.equal(match.endOffset, texts[2].length)
})

test('the first match wins', () => {
  const texts = ['The same sentence appears here for sure.', 'The same sentence appears here for sure.']
  assert.equal(findSquashed(texts, 'The same sentence appears here for sure.')?.startText, 0)
})

test('a sentence the page only shows part of is found by its head or its tail', () => {
  const long = 'This is a long sentence that the page shows in full while the corpus window holds more words than that after it.'
  const shown = ['This is a long sentence that the page shows in full while the corpus window holds more words than that after it']
  assert.ok(findSquashed(shown, long + ' And then some extra words that were cut off by the window edge.'))
  assert.equal(findSquashed(['nothing relevant at all in here, truly'], long), null)
})

test('empty needle, empty page and too-short fragments find nothing', () => {
  assert.equal(findSquashed(['abc'], ''), null)
  assert.equal(findSquashed(['abc'], '   '), null)
  assert.equal(findSquashed([], 'abc def ghi jkl mno pqr stu vwx yz'), null)
})

test('a cited fragment is widened to the whole sentence it sits in', () => {
  const text = 'A port, not the production system. Production used 512-token windows and pgvector; this port uses 256-wordpiece windows with 64 overlap. No LLM, no API.'
  const from = text.indexOf('port uses')
  const to = text.indexOf(' No LLM')
  const widened = expandToSentence(text, from, to)
  assert.equal(text.slice(widened.from, widened.to), 'Production used 512-token windows and pgvector; this port uses 256-wordpiece windows with 64 overlap.')
})

test('a range that already is whole sentences is left alone', () => {
  const text = 'First sentence here. Second sentence follows it! Third one ends the text.'
  const from = text.indexOf('Second')
  const to = text.indexOf(' Third')
  assert.deepEqual(expandToSentence(text, from, to), { from, to })
  assert.deepEqual(expandToSentence(text, 0, text.length), { from: 0, to: text.length })
})

test('widening ignores periods inside numbers and file names, and steps over closing quotes', () => {
  const text = 'He said "No." Then the figure 8.5/10 came from profile.json and stayed put (really). Done.'
  const from = text.indexOf('figure')
  const to = text.indexOf('came')
  const widened = expandToSentence(text, from, to)
  assert.equal(text.slice(widened.from, widened.to), 'Then the figure 8.5/10 came from profile.json and stayed put (really).')
})

test('a fragment with no full stop after it runs to the end of the text', () => {
  const text = 'Start here. A sentence with no full stop at the end'
  const from = text.indexOf('with no')
  assert.deepEqual(expandToSentence(text, from, from + 7), { from: text.indexOf('A sentence'), to: text.length })
})
