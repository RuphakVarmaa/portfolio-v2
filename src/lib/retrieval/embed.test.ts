import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { cosine, decodeFloat32, encodeFloat32, normalize } from './cosine.ts'
import {
  EMBED_DIM,
  EMBEDDINGS_MODEL,
  MAX_TOKENS,
  PARITY_SENTENCES,
  buildEmbeddingsFile,
  createEncoder,
  meanPool,
  readEmbeddings,
  type OrtLike,
  type OrtSessionLike,
} from './embed.ts'
import { encode, parseVocab } from './wordpiece.ts'

const vocab = parseVocab(readFileSync(new URL('../../../public/models/minilm/vocab.txt', import.meta.url), 'utf8'))

// ---- a stand-in encoder as a real ONNX file ------------------------------------------------------------
// Same inputs and output as all-MiniLM-L6-v2 (int64 input_ids / attention_mask / token_type_ids, float
// last_hidden_state), but the "network" is one Gather over a seeded embedding table. It lets the tests drive
// the real ONNX Runtime Web (the Node entry of the same package the browser uses) without a model file.

const DIM = 8

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const varint = (n: number): Buffer => {
  const out: number[] = []
  let v = BigInt(n)
  while (v > 0x7fn) {
    out.push(Number(v & 0x7fn) | 0x80)
    v >>= 7n
  }
  out.push(Number(v))
  return Buffer.from(out)
}
const tag = (field: number, wire: number) => varint((field << 3) | wire)
const lenDelim = (field: number, buf: Buffer) => Buffer.concat([tag(field, 2), varint(buf.length), buf])
const str = (field: number, s: string) => lenDelim(field, Buffer.from(s, 'utf8'))
const int = (field: number, n: number) => Buffer.concat([tag(field, 0), varint(n)])
const dimParam = (name: string) => lenDelim(1, str(2, name))
const dimValue = (n: number) => lenDelim(1, int(1, n))
const tensorType = (elem: number, dims: Buffer[]) => lenDelim(1, Buffer.concat([int(1, elem), lenDelim(2, Buffer.concat(dims))]))
const valueInfo = (name: string, elem: number, dims: Buffer[]) => Buffer.concat([str(1, name), lenDelim(2, tensorType(elem, dims))])

function standInModel(table: Float32Array, rows: number): Uint8Array {
  const initializer = Buffer.concat([int(1, rows), int(1, DIM), int(2, 1), str(8, 'table'), lenDelim(9, Buffer.from(table.buffer, table.byteOffset, table.byteLength))])
  const node = Buffer.concat([str(1, 'table'), str(1, 'input_ids'), str(2, 'last_hidden_state'), str(3, 'lookup'), str(4, 'Gather')])
  const ids = (name: string) => lenDelim(11, valueInfo(name, 7, [dimParam('batch'), dimParam('seq')]))
  const graph = Buffer.concat([
    lenDelim(1, node),
    str(2, 'stand-in-encoder'),
    lenDelim(5, initializer),
    ids('input_ids'),
    ids('attention_mask'),
    ids('token_type_ids'),
    lenDelim(12, valueInfo('last_hidden_state', 1, [dimParam('batch'), dimParam('seq'), dimValue(DIM)])),
  ])
  return new Uint8Array(Buffer.concat([int(1, 8), str(2, 'quorum-test'), lenDelim(7, graph), lenDelim(8, int(2, 13))]))
}

const rng = mulberry32(12345)
const table = Float32Array.from({ length: vocab.size * DIM }, () => rng() * 2 - 1)

/** The same pipeline in plain JavaScript: look up each id, mean over the mask, unit length. */
function reference(text: string, maxTokens = MAX_TOKENS): Float32Array {
  const encoded = encode(text, vocab, maxTokens)
  const sum = new Float64Array(DIM)
  for (const id of encoded.ids) for (let d = 0; d < DIM; d++) sum[d] += table[id * DIM + d]
  return normalize(Array.from(sum, (v) => v / encoded.ids.length))
}

interface RealSession extends OrtSessionLike {
  release(): Promise<void>
}
let ort: (OrtLike & { InferenceSession: { create(model: Uint8Array, options: object): Promise<RealSession> }; env: { wasm: { numThreads: number; wasmPaths: string } } }) | null = null
let session: RealSession | null = null

before(async () => {
  const mod = (await import('onnxruntime-web')) as unknown as NonNullable<typeof ort>
  mod.env.wasm.numThreads = 1
  mod.env.wasm.wasmPaths = new URL('../../../node_modules/onnxruntime-web/dist/', import.meta.url).pathname
  ort = mod
  session = await mod.InferenceSession.create(standInModel(table, vocab.size), { executionProviders: ['wasm'] })
})

after(async () => {
  await session?.release()
})

test('the encoder runs the real ONNX Runtime and matches the plain-JavaScript reference', async () => {
  assert.ok(ort && session)
  assert.deepEqual([...session.inputNames], ['input_ids', 'attention_mask', 'token_type_ids'])
  const encoder = createEncoder(ort, session, vocab)
  assert.equal(encoder.dim, null)
  const texts = ['pgvector HNSW indexing', 'Where did this answer come from?', '', 'Résumé — naïve café · 8.5/10', 'a']
  const vectors = await encoder.encode(texts)
  assert.equal(encoder.dim, DIM)
  assert.equal(vectors.length, texts.length)
  vectors.forEach((vector, i) => {
    assert.equal(vector.length, DIM)
    assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-5, 'unit length')
    assert.ok(cosine(vector, reference(texts[i])) > 0.999999, `text ${i}`)
  })
  assert.ok(cosine(vectors[0], vectors[1]) < 0.999, 'different texts give different vectors')
})

test('a long text is cut so the whole sequence, specials included, fits the limit', async () => {
  assert.ok(ort && session)
  const long = Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ')
  const [full] = await createEncoder(ort, session, vocab).encode([long])
  assert.ok(cosine(full, reference(long, MAX_TOKENS)) > 0.999999)
  const [short] = await createEncoder(ort, session, vocab, { maxTokens: 16 }).encode([long])
  assert.ok(cosine(short, reference(long, 16)) > 0.999999)
  assert.ok(cosine(short, full) < 0.9999, 'the limit changes what is pooled')
})

test('prepare and run are the two steps of encode', async () => {
  assert.ok(ort && session)
  const encoder = createEncoder(ort, session, vocab)
  const prepared = encoder.prepare('pgvector')
  assert.equal(prepared.ids[0], vocab.cls)
  assert.equal(prepared.ids[prepared.ids.length - 1], vocab.sep)
  const viaSteps = await encoder.run(prepared)
  const [direct] = await encoder.encode(['pgvector'])
  assert.deepEqual(Array.from(viaSteps), Array.from(direct))
})

test('encode reports progress and honours an abort signal', async () => {
  assert.ok(ort && session)
  const encoder = createEncoder(ort, session, vocab)
  const progress: Array<[number, number]> = []
  await encoder.encode(['one', 'two', 'three'], { onProgress: (done, total) => progress.push([done, total]) })
  assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]])
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => encoder.encode(['one'], { signal: controller.signal }), { name: 'AbortError' })
})

test('tensors are int64 [1, length]; an input the site cannot fill is an error, not a guess', async () => {
  const made: Array<{ type: string; data: BigInt64Array; dims: readonly number[] }> = []
  class FakeTensor {
    constructor(type: 'int64', data: BigInt64Array, dims: readonly number[]) {
      made.push({ type, data, dims })
    }
  }
  const fake = (inputNames: string[], output: { data: number[]; dims: number[] }): OrtSessionLike => ({
    inputNames,
    outputNames: ['last_hidden_state'],
    run: async () => ({ last_hidden_state: output }),
  })
  const ids = encode('hello', vocab, 258).ids
  await createEncoder({ Tensor: FakeTensor }, fake(['input_ids', 'attention_mask', 'token_type_ids'], { data: new Array(ids.length * 2).fill(1), dims: [1, ids.length, 2] }), vocab).encode(['hello'])
  assert.equal(made.length, 3)
  assert.ok(made.every((m) => m.type === 'int64' && m.data instanceof BigInt64Array && m.dims[0] === 1 && m.dims[1] === ids.length))
  assert.deepEqual(Array.from(made[0].data), ids.map(BigInt))
  assert.deepEqual(Array.from(made[1].data), ids.map(() => 1n))
  assert.deepEqual(Array.from(made[2].data), ids.map(() => 0n))
  await assert.rejects(() => createEncoder({ Tensor: FakeTensor }, fake(['pixel_values'], { data: [], dims: [1, 0, 0] }), vocab).encode(['x']), /pixel_values/)
})

test('meanPool averages over the mask and normalises; an already pooled [1, dim] output passes through', () => {
  const pooled = meanPool([1, 2, 3, 4, 100, 200], [1, 3, 2], [1, 1, 0])
  const expected = normalize([2, 3])
  assert.ok(Math.abs(pooled[0] - expected[0]) < 1e-6 && Math.abs(pooled[1] - expected[1]) < 1e-6)
  assert.deepEqual(Array.from(meanPool([3, 4], [1, 2], [1])), Array.from(normalize([3, 4])))
  assert.deepEqual(Array.from(meanPool([1, 2], [1, 1, 2], [0])), [0, 0])
  assert.throws(() => meanPool([], [1], []), /Unexpected encoder output shape/)
})

test('the constants are the model\'s: 384 dimensions, 256 wordpieces plus the two specials', () => {
  assert.equal(EMBED_DIM, 384)
  assert.equal(MAX_TOKENS, 258)
  assert.equal(EMBEDDINGS_MODEL, 'all-MiniLM-L6-v2 q8')
})

test('five fixed parity sentences, plain text without figures', () => {
  assert.equal(PARITY_SENTENCES.length, 5)
  assert.equal(new Set(PARITY_SENTENCES).size, 5)
  for (const sentence of PARITY_SENTENCES) assert.ok(sentence.length > 20 && !/\d/.test(sentence), sentence)
})

// ---- embeddings.json ---------------------------------------------------------------------------------------

const entries = [
  { id: 'a.0', input: 'Heading\nfirst window', vector: normalize([1, 2, 3, 4]) },
  { id: 'a.1', input: 'Heading\nsecond window', vector: normalize([4, 3, 2, 1]) },
]

test('an embeddings file round-trips: vectors come back exactly, keyed by id', () => {
  const file = buildEmbeddingsFile({ sha256: 'abc', entries })
  assert.equal(file.model, 'all-MiniLM-L6-v2 q8')
  assert.equal(file.dim, 4)
  assert.equal(file.sha256, 'abc')
  assert.deepEqual([file.pooling, file.normalized, file.maxTokens], ['mean', true, 258])
  assert.deepEqual(Object.keys(file.vectors), ['a.0', 'a.1'])
  const read = readEmbeddings(JSON.parse(JSON.stringify(file)), entries.map(({ id, input }) => ({ id, input })))
  assert.deepEqual([read.reused, read.stale], [2, 0])
  assert.deepEqual(Array.from(read.vectors[1] as Float32Array), Array.from(entries[1].vector))
  assert.deepEqual(Array.from(decodeFloat32(file.vectors['a.0'], 4)), Array.from(entries[0].vector))
  assert.equal(encodeFloat32(entries[0].vector), file.vectors['a.0'])
})

test('a vector made from different text is stale and is not reused', () => {
  const file = buildEmbeddingsFile({ sha256: 'abc', entries })
  const read = readEmbeddings(file, [
    { id: 'a.0', input: 'Heading\nfirst window' },
    { id: 'a.1', input: 'Heading\nsecond window, edited' },
    { id: 'a.2', input: 'new chunk' },
  ])
  assert.deepEqual([read.reused, read.stale], [1, 2])
  assert.ok(read.vectors[0] instanceof Float32Array)
  assert.deepEqual([read.vectors[1], read.vectors[2]], [null, null])
})

test('anything that is not a usable embeddings file means "embed everything here"', () => {
  const expected = entries.map(({ id, input }) => ({ id, input }))
  for (const bad of [null, undefined, 'x', 42, {}, { vectors: {}, inputs: {} }, { vectors: {}, inputs: {}, dim: 'x' }]) {
    const read = readEmbeddings(bad, expected)
    assert.deepEqual([read.reused, read.stale], [0, 2])
    assert.deepEqual(read.vectors, [null, null])
  }
  const file = buildEmbeddingsFile({ sha256: 'abc', entries })
  assert.deepEqual(readEmbeddings(file, expected, 384).vectors, [null, null], 'a file of another dimension is not reused')
  const corrupt = { ...file, vectors: { ...file.vectors, 'a.0': '!!!not base64!!!' } }
  assert.deepEqual(readEmbeddings(corrupt, expected).vectors.map((v) => v !== null), [false, true])
})
