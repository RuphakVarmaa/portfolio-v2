import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { OVERLAP, STRIDE, WINDOW, cutWindows, windowSlice, type TokenSpan } from './chunker.ts'
import { parseVocab, tokenize } from './wordpiece.ts'

/** n one-character tokens, every one a word start ("abcabc..." separated by spaces). */
function words(n: number): { text: string; tokens: TokenSpan[] } {
  const text = Array.from({ length: n }, () => 'a').join(' ')
  return { text, tokens: Array.from({ length: n }, (_, i) => ({ start: i * 2, end: i * 2 + 1, first: true })) }
}

test('the numbers are the spec\'s: 256-wordpiece windows, stride 192, overlap 64', () => {
  assert.equal(WINDOW, 256)
  assert.equal(STRIDE, 192)
  assert.equal(OVERLAP, 64)
})

test('a run that fits in one window is one window; an empty run is none', () => {
  assert.deepEqual(cutWindows([]), [])
  assert.deepEqual(cutWindows(words(1).tokens), [{ start: 0, end: 1 }])
  assert.deepEqual(cutWindows(words(256).tokens), [{ start: 0, end: 256 }])
})

test('longer runs advance by the stride and neighbours share exactly the overlap', () => {
  assert.deepEqual(cutWindows(words(300).tokens), [
    { start: 0, end: 256 },
    { start: 192, end: 300 },
  ])
  const windows = cutWindows(words(700).tokens)
  assert.deepEqual(windows, [
    { start: 0, end: 256 },
    { start: 192, end: 448 },
    { start: 384, end: 640 },
    { start: 576, end: 700 },
  ])
  for (let i = 1; i < windows.length; i++) assert.equal(windows[i - 1].end - windows[i].start, OVERLAP)
})

test('every token is covered, no window is over 256, and the last window ends at the last token', () => {
  for (const n of [257, 258, 300, 448, 449, 450, 511, 512, 513, 640, 641, 999, 1500]) {
    const windows = cutWindows(words(n).tokens)
    assert.equal(windows[0].start, 0, `n=${n}`)
    assert.equal(windows[windows.length - 1].end, n, `n=${n}`)
    const covered = new Uint8Array(n)
    for (const w of windows) {
      assert.ok(w.end - w.start <= WINDOW, `n=${n}`)
      assert.ok(w.end > w.start)
      for (let i = w.start; i < w.end; i++) covered[i] = 1
    }
    assert.equal(covered.reduce((a, b) => a + b, 0), n, `n=${n}: every token is in a window`)
    for (let i = 1; i < windows.length; i++) assert.ok(windows[i].start > windows[i - 1].start, 'windows move forward')
  }
})

test('windows start and end on word boundaries, so no word is cut in half', () => {
  // Words of five pieces each (one first piece and four continuations).
  const tokens: TokenSpan[] = Array.from({ length: 1000 }, (_, i) => ({ start: i, end: i + 1, first: i % 5 === 0 }))
  const windows = cutWindows(tokens)
  assert.ok(windows.length > 3)
  for (const w of windows) {
    assert.ok(tokens[w.start].first, `window ${w.start} starts mid-word`)
    assert.ok(w.end === tokens.length || tokens[w.end].first, `window ending at ${w.end} cuts a word`)
    assert.ok(w.end - w.start <= WINDOW)
  }
  // Snapping back costs at most one word, so the overlap stays within a word or two of 64.
  for (let i = 1; i < windows.length; i++) {
    const overlap = windows[i - 1].end - windows[i].start
    assert.ok(overlap >= OVERLAP - 5 && overlap <= OVERLAP + 5, `overlap ${overlap}`)
  }
})

test('a single word longer than the window is cut anyway, and everything is still covered', () => {
  const giant: TokenSpan[] = [{ start: 0, end: 1, first: true }, ...Array.from({ length: 600 }, (_, i) => ({ start: i + 1, end: i + 2, first: false }))]
  const windows = cutWindows(giant)
  assert.equal(windows[windows.length - 1].end, giant.length)
  const covered = new Set<number>()
  for (const w of windows) for (let i = w.start; i < w.end; i++) covered.add(i)
  assert.equal(covered.size, giant.length)
})

test('options are validated', () => {
  assert.throws(() => cutWindows(words(10).tokens, { window: 8, stride: 9 }), RangeError)
  assert.throws(() => cutWindows(words(10).tokens, { window: 0 }), RangeError)
  assert.deepEqual(cutWindows(words(10).tokens, { window: 4, stride: 3 }).map((w) => [w.start, w.end]), [[0, 4], [3, 7], [6, 10]])
})

test('windowSlice returns the exact text from the first token to the last', () => {
  const { text, tokens } = words(10)
  const [first] = cutWindows(tokens, { window: 4, stride: 3 })
  assert.deepEqual(windowSlice(text, tokens, first), { from: 0, to: 7, text: 'a a a a' })
})

test('with the real vocabulary: windows are clean substrings of the text and 256 wordpieces at most', () => {
  const vocab = parseVocab(readFileSync(new URL('../../../public/models/minilm/vocab.txt', import.meta.url), 'utf8'))
  const sentence = 'Adaptive sliding windows keep pgvector HNSW results grounded with citation metadata. '
  const text = sentence.repeat(60).trim()
  const tokens = tokenize(text, vocab)
  assert.ok(tokens.length > 700)
  const windows = cutWindows(tokens)
  for (const w of windows) {
    const slice = windowSlice(text, tokens, w)
    assert.ok(w.end - w.start <= 256)
    assert.equal(slice.text, text.slice(slice.from, slice.to))
    assert.ok(!/^\s|\s$/.test(slice.text), 'a window never starts or ends on a space')
    assert.ok(/^[A-Za-z]/.test(slice.text), 'a window starts on a word, not in the middle of one')
    assert.equal(tokenize(slice.text, vocab).length, w.end - w.start, 're-tokenizing the slice gives the same piece count')
  }
})
