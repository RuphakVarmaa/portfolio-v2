import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeFloat32, encodeFloat32, normalize } from '../../lib/retrieval/cosine.ts'
import { EMBED_DIM, EMBEDDINGS_MODEL, parityCosines } from '../../lib/retrieval/embed.ts'
import { MODEL_ASSET_PATH, PARITY_SENTENCES, fixtureFromParity, looksLikeModel, modelListed, previewFixture, serializeFixture } from './parity-fixture.ts'

/** A deterministic unit vector (a small LCG), standing in for what the encoder would report. */
function unit(seed: number, dim = EMBED_DIM): Float32Array {
  const raw = new Float32Array(dim)
  let x = seed >>> 0
  for (let i = 0; i < dim; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    raw[i] = x / 0xffffffff - 0.5
  }
  return normalize(raw)
}

const reported = () => PARITY_SENTENCES.map((_, i) => encodeFloat32(unit(i + 1)))
const AT = '2026-10-11T00:00:00.000Z'
const reasonOf = (result: ReturnType<typeof fixtureFromParity>) => (result.ok ? '' : result.reason)

test('there are five fixed sentences, all distinct (they are the ones embed.ts exports)', () => {
  assert.equal(PARITY_SENTENCES.length, 5)
  assert.equal(new Set(PARITY_SENTENCES).size, 5)
})

test('five unit vectors become the fixture the Node test reads: browser-made, dated, the five sentences, base64 vectors', () => {
  const made = fixtureFromParity(reported(), AT)
  assert.ok(made.ok)
  const { fixture } = made
  assert.equal(fixture.generatedBy, 'browser')
  assert.equal(fixture.generatedAt, AT)
  assert.equal(fixture.model, EMBEDDINGS_MODEL)
  assert.equal(fixture.dim, EMBED_DIM)
  assert.deepEqual(fixture.sentences, [...PARITY_SENTENCES])
  assert.equal(fixture.vectors?.length, 5)
  // The vectors survive the trip: against themselves the parity cosine is 1.
  const fresh = PARITY_SENTENCES.map((_, i) => unit(i + 1))
  for (const value of parityCosines(fixture, fresh)) assert.ok(value > 0.9999)
})

test('anything that is not five unit-length vectors of the encoder dimension is refused, with the reason', () => {
  assert.match(reasonOf(fixtureFromParity(undefined, AT)), /no parity vectors/)
  assert.match(reasonOf(fixtureFromParity(reported().slice(0, 4), AT)), /4 parity vectors; 5 were expected/)

  const short = reported()
  short[2] = encodeFloat32(unit(9, 10))
  assert.match(reasonOf(fixtureFromParity(short, AT)), /Vector 3 is not 384 numbers/)

  const loud = reported()
  loud[0] = encodeFloat32(unit(5).map((value) => value * 2))
  assert.match(reasonOf(fixtureFromParity(loud, AT)), /Vector 1 is not unit length/)

  const withNaN = reported()
  const bad = unit(7)
  bad[3] = Number.NaN
  withNaN[4] = encodeFloat32(bad)
  assert.equal(fixtureFromParity(withNaN, AT).ok, false)

  const junk = reported()
  junk[1] = 'not base64 !!'
  assert.equal(fixtureFromParity(junk, AT).ok, false)
})

test('the file is written like the empty template: sorted keys, two spaces, a trailing newline; and it round-trips', () => {
  const made = fixtureFromParity(reported(), AT)
  assert.ok(made.ok)
  const text = serializeFixture(made.fixture)
  assert.ok(text.endsWith('}\n'))
  assert.deepEqual(Object.keys(JSON.parse(text) as object), ['dim', 'generatedAt', 'generatedBy', 'model', 'sentences', 'vectors'])
  assert.deepEqual(JSON.parse(text), made.fixture)
  assert.ok(text.includes('\n  "dim": 384,'))
  const decoded = decodeFloat32((JSON.parse(text) as { vectors: string[] }).vectors[0], EMBED_DIM)
  assert.deepEqual(Array.from(decoded), Array.from(unit(1)))
})

test('the preview shortens every vector; the real file keeps them whole', () => {
  const made = fixtureFromParity(reported(), AT)
  assert.ok(made.ok)
  const preview = previewFixture(made.fixture, 12)
  const parsed = JSON.parse(preview) as { vectors: string[] }
  assert.ok(parsed.vectors.every((vector) => vector.length === 13 && vector.endsWith('…')))
  assert.ok(preview.length < serializeFixture(made.fixture).length / 3)
})

test('a dev-server HTML fallback or a tiny file is not a model; a large binary is', () => {
  const response = (ok: boolean, type: string, length?: string) => ({ ok, headers: { get: (name: string) => (name === 'content-type' ? type : name === 'content-length' ? (length ?? null) : null) } })
  assert.equal(looksLikeModel(response(false, 'text/html')), false)
  assert.equal(looksLikeModel(response(true, 'text/html; charset=utf-8')), false)
  assert.equal(looksLikeModel(response(true, 'application/octet-stream', '120')), false)
  assert.equal(looksLikeModel(response(true, 'application/octet-stream', '23000000')), true)
  assert.equal(looksLikeModel(response(true, 'application/octet-stream')), true, 'no length header: trust the content type')
})

test('the build inventory says whether the encoder is published, so the page never probes a file that is not there', () => {
  assert.equal(modelListed({ assets: [{ path: MODEL_ASSET_PATH, bytes: 0, present: false }] }), false)
  assert.equal(modelListed({ assets: [{ path: MODEL_ASSET_PATH, bytes: 23_000_000, present: true }] }), true)
  assert.equal(modelListed({ assets: [{ path: 'models/yolov8n/yolov8n-320.onnx', present: true }] }), false, 'an inventory that does not list it: not published')
  assert.equal(modelListed({ assets: [] }), false)
  // Not a build-info file (the dev server answers with its HTML page): ask for the file itself.
  assert.equal(modelListed(null), null)
  assert.equal(modelListed('<!doctype html>'), null)
  assert.equal(modelListed({}), null)
  assert.equal(modelListed({ assets: 'nope' }), null)
})
