import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TAP_START, describeProgress, focusAfter, reduceProgress, type ExpectedSizes, type TapKind } from './tap-view.ts'

const expected: ExpectedSizes = { vocabulary: 231_508, model: 22_970_000, runtime: 14_239_897 }
const total = 231_508 + 22_970_000 + 14_239_897

test('the bar counts bytes across the three downloads against the sizes this build ships', () => {
  let progress = reduceProgress(TAP_START, { stage: 'vocabulary', loaded: 231_508, total: 231_508 })
  let view = describeProgress(progress, expected)
  assert.ok(Math.abs((view.fraction as number) - 231_508 / total) < 1e-9)
  assert.equal(view.detail, `231.5 KB of ${(total / 1e6).toFixed(2)} MB`)

  progress = reduceProgress(progress, { stage: 'model', loaded: 10_000_000, total: 22_970_000 })
  view = describeProgress(progress, expected)
  assert.ok(Math.abs((view.fraction as number) - (231_508 + 10_000_000) / total) < 1e-9)

  progress = reduceProgress(progress, { stage: 'model', loaded: 22_970_000, total: 22_970_000 })
  progress = reduceProgress(progress, { stage: 'runtime', loaded: 14_239_897, total: 14_239_897 })
  assert.equal(describeProgress(progress, expected).fraction, 1)
})

test('a file larger than expected grows the total instead of overflowing the bar', () => {
  const progress = reduceProgress(TAP_START, { stage: 'model', loaded: 30_000_000, total: 25_000_000 })
  const view = describeProgress(progress, expected)
  assert.ok((view.fraction as number) <= 1)
  assert.ok((view.fraction as number) > 0)
})

test('unknown sizes give a hatched bar and only the bytes read', () => {
  const unknown: ExpectedSizes = { vocabulary: null, model: null, runtime: null }
  const progress = reduceProgress(TAP_START, { stage: 'vocabulary', loaded: 1500, total: 0 })
  assert.deepEqual(describeProgress(progress, unknown), { fraction: null, detail: '1.5 KB' })
  assert.deepEqual(describeProgress(TAP_START, unknown), { fraction: null, detail: '' })
})

test('after the downloads the session step is hatched and the page step is a percentage', () => {
  let progress = reduceProgress(TAP_START, { stage: 'runtime', loaded: 14_239_897, total: 14_239_897 })
  progress = reduceProgress(progress, { stage: 'session', loaded: 0, total: 0 })
  assert.equal(progress.stage, 'session')
  assert.equal(describeProgress(progress, expected).fraction, null)
  assert.match(describeProgress(progress, expected).detail, /MB read$/)

  progress = reduceProgress(progress, { stage: 'embeddings', loaded: 0, total: 0, pct: 40 })
  assert.deepEqual(describeProgress(progress, expected), { fraction: 0.4, detail: '40%' })
  progress = reduceProgress(progress, { stage: 'embeddings', loaded: 0, total: 0, pct: 250 })
  assert.equal(describeProgress(progress, expected).fraction, 1)
  // A message without a percentage keeps the last one.
  assert.equal(reduceProgress(progress, { stage: 'embeddings', loaded: 0, total: 0 }).pct, 100)
})

test('reducing never mutates the previous state', () => {
  const before = reduceProgress(TAP_START, { stage: 'model', loaded: 5, total: 10 })
  const snapshot = JSON.stringify(before)
  reduceProgress(before, { stage: 'model', loaded: 9, total: 10 })
  assert.equal(JSON.stringify(before), snapshot)
  assert.deepEqual(TAP_START, { stage: 'vocabulary', files: {}, pct: null })
})

test('the keyboard follows the button that was pressed: Load hands it to Stop, Stop and failure hand it back to Load, a finished load hands it to the engine choice', () => {
  assert.equal(focusAfter('loading'), 'stop')
  assert.equal(focusAfter('idle'), 'load')
  assert.equal(focusAfter('error'), 'load')
  assert.equal(focusAfter('ready'), 'engine')
})

test('a tap with nothing to press hands the focus to nothing', () => {
  const kinds: TapKind[] = ['unavailable', 'idle', 'loading', 'ready', 'error']
  assert.deepEqual(kinds.filter((kind) => focusAfter(kind) === null), ['unavailable'])
})
