import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copy } from '../../data/copy.ts'
import { pageRecords } from './page-records.ts'

const texts = (options?: { detector?: boolean }) => pageRecords(options).map((record) => record.text)

test('the search index quotes what the Vision panel says: that nothing is detected, until a detector is published', () => {
  const v = copy.services.vision
  const without = texts()
  assert.ok(without.includes(v.demo.noDetector.caption), 'the honest caption of this build is in the index')
  assert.ok(without.includes(v.demo.noDetector.plain))
  assert.ok(!without.includes(v.caption), 'the sentence "YOLOv8n int8 at 320 px runs ... here" is not quoted while no detector runs')
  assert.ok(!without.includes(v.plain), 'nor "draws a box around each object it recognises"')
  assert.ok(!without.some((text) => /runs single-threaded in WebAssembly here/.test(text)))
})

test('with a published detector the index quotes the original captions instead', () => {
  const v = copy.services.vision
  const withDetector = texts({ detector: true })
  assert.ok(withDetector.includes(v.caption))
  assert.ok(withDetector.includes(v.plain))
  assert.ok(!withDetector.includes(v.demo.noDetector.caption))
})

test('the other panels are unchanged by the detector flag', () => {
  const strip = (all: string[]) => all.filter((text) => !/camera|detector|YOLOv8n/i.test(text))
  assert.deepEqual(strip(texts()), strip(texts({ detector: true })))
})
