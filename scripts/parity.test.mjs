// Parity test (spec 6.6, DoD): the build-time (Node) embeddings of five fixed sentences must match the
// browser's to cosine >= 0.999. The browser's vectors live in src/lib/retrieval/parity-fixture.json. They are
// produced once by a real browser run (the retrieval worker reports them in the result of `retrieval.loadModel`,
// and /experiments/ -> "export parity fixture" writes the file with `buildParityFixture` from embed.ts) and are
// never typed in or invented.
//
//   - model absent (public/models/minilm/model_quantized.onnx)      -> the comparison is SKIPPED, not failed
//   - fixture still the empty template (`vectors: null`)             -> the comparison is SKIPPED, not failed
//   - both present                                                    -> embeds the five sentences with the same
//                                                                        code the build uses and compares
//
// The shape checks below always run: they do not need the model.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL = join(ROOT, 'public', 'models', 'minilm', 'model_quantized.onnx')
const VOCAB = join(ROOT, 'public', 'models', 'minilm', 'vocab.txt')
const FIXTURE = join(ROOT, 'src', 'lib', 'retrieval', 'parity-fixture.json')
const lib = (name) => import(pathToFileURL(join(ROOT, 'src', 'lib', 'retrieval', name)).href)

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))

const skipReason = !existsSync(MODEL)
  ? 'no embedding model published (public/models/minilm/model_quantized.onnx); BM25 only'
  : !fixture.vectors
    ? 'parity-fixture.json has no browser vectors yet: load the model on the page, then export the fixture from /experiments/ and save it over src/lib/retrieval/parity-fixture.json'
    : false

test('the parity fixture is well formed and holds exactly the five fixed sentences', async () => {
  const { PARITY_SENTENCES } = await lib('embed.ts')
  assert.deepEqual(fixture.sentences, [...PARITY_SENTENCES], 'the fixture sentences must be the ones embed.ts exports')
  assert.equal(fixture.sentences.length, 5)
  assert.equal(fixture.model, 'all-MiniLM-L6-v2 q8')
  assert.equal(fixture.dim, 384)
  if (fixture.vectors === null) {
    // The empty template: nothing was recorded, so nothing is claimed.
    assert.equal(fixture.generatedBy, null)
    assert.equal(fixture.generatedAt, null)
  } else {
    assert.equal(fixture.generatedBy, 'browser')
    assert.equal(fixture.vectors.length, 5)
    const { decodeFloat32, norm } = await lib('cosine.ts')
    for (const encoded of fixture.vectors) {
      const vector = decodeFloat32(encoded, fixture.dim)
      assert.ok(Math.abs(norm(vector) - 1) < 1e-3, 'vectors are unit length')
    }
  }
})

test('the vocabulary the encoder needs is published and is the BERT uncased vocabulary', () => {
  assert.ok(existsSync(VOCAB), 'public/models/minilm/vocab.txt is missing')
  assert.equal(createHash('sha256').update(readFileSync(VOCAB)).digest('hex'), '07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3')
})

test('build-time embeddings of five sentences match the browser path (cosine >= 0.999)', { skip: skipReason }, async () => {
  const { parseVocab } = await lib('wordpiece.ts')
  const { createEncoder, parityCosines, PARITY_SENTENCES } = await lib('embed.ts')
  const ort = await import('onnxruntime-web')
  ort.env.wasm.numThreads = 1
  ort.env.wasm.wasmPaths = join(ROOT, 'node_modules', 'onnxruntime-web', 'dist') + '/'
  const session = await ort.InferenceSession.create(new Uint8Array(readFileSync(MODEL)), { executionProviders: ['wasm'] })
  try {
    const encoder = createEncoder(ort, session, parseVocab(readFileSync(VOCAB, 'utf8')))
    const fresh = await encoder.encode(PARITY_SENTENCES)
    const cosines = parityCosines(fixture, fresh)
    cosines.forEach((value, i) => assert.ok(value >= 0.999, `sentence ${i + 1}: cosine ${value.toFixed(5)} is below 0.999`))
  } finally {
    await session.release()
  }
})
