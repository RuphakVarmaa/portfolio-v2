import assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitSentences } from './sentences.ts'

const parts = (text: string) => splitSentences(text).map((r) => text.slice(r.from, r.to))

test('splits on . ! ? followed by a space', () => {
  assert.deepEqual(parts('One sentence is here. Another is there! Is a third here? Yes it is.'), [
    'One sentence is here.',
    'Another is there!',
    'Is a third here?',
    'Yes it is.',
  ])
})

test('periods inside numbers, versions, file names and handles never split', () => {
  const text = 'CGPA is 8.5/10 and the release is v2026.06 with mAP@0.5 in profile.json today.'
  assert.deepEqual(parts(text), [text])
})

test('an abbreviation is not a sentence of its own', () => {
  assert.deepEqual(parts('B.E. Computer Science and Engineering — KPR Institute, Coimbatore — 2024 - 2028.'), [
    'B.E. Computer Science and Engineering — KPR Institute, Coimbatore — 2024 - 2028.',
  ])
  assert.deepEqual(parts('Tools such as e.g. Semgrep run here. Then the second sentence follows.'), [
    'Tools such as e.g. Semgrep run here.',
    'Then the second sentence follows.',
  ])
})

test('short fragments join the next sentence; a short last fragment joins the one before', () => {
  assert.deepEqual(parts('Yes. It runs in your browser, with no server at all.'), ['Yes. It runs in your browser, with no server at all.'])
  assert.deepEqual(parts('Nothing runs until you press it. Really.'), ['Nothing runs until you press it. Really.'])
})

test('closing quotes and brackets stay with their sentence', () => {
  assert.deepEqual(parts('He called it "good enough." Then the work continued.'), ['He called it "good enough."', 'Then the work continued.'])
  assert.deepEqual(parts('This is the end (really.) And this is the start.'), ['This is the end (really.)', 'And this is the start.'])
})

test('ranges are trimmed, exact, in order and non-overlapping', () => {
  const text = '  First one is here.   Second one is here.  '
  const ranges = splitSentences(text)
  assert.deepEqual(ranges.map((r) => text.slice(r.from, r.to)), ['First one is here.', 'Second one is here.'])
  for (let i = 1; i < ranges.length; i++) assert.ok(ranges[i].from >= ranges[i - 1].to)
})

test('empty and whitespace-only text have no sentences; text without a full stop is one', () => {
  assert.deepEqual(splitSentences(''), [])
  assert.deepEqual(splitSentences('   \n  '), [])
  assert.deepEqual(parts('pgvector HNSW'), ['pgvector HNSW'])
  assert.deepEqual(parts('No final punctuation but plenty of words'), ['No final punctuation but plenty of words'])
})
