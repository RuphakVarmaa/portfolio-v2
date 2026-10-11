/**
 * The embedding path (tier 1): all-MiniLM-L6-v2, int8, through ONNX Runtime Web (spec 6.6).
 *
 * Everything model-shaped lives here and nothing here imports ONNX Runtime: callers pass in the `ort`
 * module and an already-created session. That is what lets the same code run
 *   - in the retrieval worker, on a tap (browser ORT, WASM from /ort/), and
 *   - in scripts/embed-corpus.mjs at build time (the Node entry of the same onnxruntime-web package),
 * so the build-time embeddings and the browser's are made by identical code and the parity test can hold
 * them to cosine >= 0.999. Tests drive it with a stand-in model.
 *
 * Pipeline per text: BERT WordPiece (wordpiece.ts) -> `[CLS] pieces [SEP]` -> ONNX session
 * (`input_ids`, `attention_mask`, `token_type_ids`; int64) -> `last_hidden_state` -> mean pooling over the
 * attention mask -> L2 normalisation. One text per run, so nothing is padded and the mask is all ones.
 *
 * Pure and DOM-free.
 */
import { WINDOW } from './chunker.ts'
import { fnv1a } from './corpus.ts'
import { cosine, decodeFloat32, encodeFloat32, normalize } from './cosine.ts'
import { encode, type Encoded, type Vocab } from './wordpiece.ts'

export const EMBEDDINGS_MODEL = 'all-MiniLM-L6-v2 q8'
export const EMBED_DIM = 384
/**
 * Longest input in tokens, specials included: a full 256-wordpiece window plus `[CLS]` and `[SEP]`.
 * sentence-transformers truncates at 256 with the specials counted; the ONNX graph itself has 512
 * positions, so windows are embedded whole and nothing is cut except a heading's overflow.
 */
export const MAX_TOKENS = WINDOW + 2

/** The slice of an ONNX Runtime Web tensor this file reads. */
export interface OrtTensorLike {
  readonly data: ArrayLike<number>
  readonly dims: readonly number[]
}

/** The slice of the `onnxruntime-web` module this file uses: building an int64 tensor. */
export interface OrtLike {
  Tensor: new (type: 'int64', data: BigInt64Array, dims: readonly number[]) => unknown
}

/** The slice of `InferenceSession` this file uses. */
export interface OrtSessionLike {
  readonly inputNames: readonly string[]
  readonly outputNames: readonly string[]
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensorLike>>
}

export interface SentenceEncoder {
  /** Vector length; null until the first run reveals it. */
  readonly dim: number | null
  /** Step 1 (the "tokenize" stage): text to `[CLS] pieces [SEP]`. Synchronous and cheap. */
  prepare(text: string): Encoded
  /** Step 2 (the "embed" stage): run the model on a prepared input; one unit-length vector. */
  run(encoded: Encoded): Promise<Float32Array>
  /** Both steps for several texts, in order. */
  encode(texts: readonly string[], options?: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void }): Promise<Float32Array[]>
}

export interface EncoderOptions {
  /** Longest input in tokens, specials included. Default `MAX_TOKENS`. */
  maxTokens?: number
}

/**
 * Mean of the token vectors where `mask` is 1, as a unit vector. `dims` is `[1, tokens, dim]` (a
 * `last_hidden_state`) or `[1, dim]` (an exporter that already pooled).
 */
export function meanPool(data: ArrayLike<number>, dims: readonly number[], mask: readonly number[]): Float32Array {
  if (dims.length === 2) return normalize(Array.from({ length: dims[1] }, (_, i) => data[i]))
  if (dims.length !== 3) throw new Error(`Unexpected encoder output shape [${dims.join(', ')}]`)
  const [, tokens, dim] = dims
  const sum = new Float64Array(dim)
  let count = 0
  for (let t = 0; t < tokens; t++) {
    if (mask[t] !== 1) continue
    count += 1
    const base = t * dim
    for (let d = 0; d < dim; d++) sum[d] += data[base + d]
  }
  if (count === 0) return new Float32Array(dim)
  for (let d = 0; d < dim; d++) sum[d] /= count
  return normalize(sum)
}

export function createEncoder(ort: OrtLike, session: OrtSessionLike, vocab: Vocab, options: EncoderOptions = {}): SentenceEncoder {
  const maxTokens = options.maxTokens ?? MAX_TOKENS
  const outputName = session.outputNames.includes('last_hidden_state') ? 'last_hidden_state' : session.outputNames[0]
  let dim: number | null = null

  const tensor = (values: readonly number[]) => new ort.Tensor('int64', BigInt64Array.from(values, (v) => BigInt(v)), [1, values.length])

  async function run(encoded: Encoded): Promise<Float32Array> {
    const feeds: Record<string, unknown> = {}
    for (const name of session.inputNames) {
      if (name === 'input_ids') feeds[name] = tensor(encoded.ids)
      else if (name === 'attention_mask') feeds[name] = tensor(encoded.attention)
      else if (name === 'token_type_ids') feeds[name] = tensor(encoded.typeIds)
      else throw new Error(`The encoder asks for an input called "${name}", which this site does not know how to fill`)
    }
    const outputs = await session.run(feeds)
    const output = outputs[outputName]
    if (!output) throw new Error(`The encoder returned no "${outputName}" output`)
    const vector = meanPool(output.data, output.dims, encoded.attention)
    dim = vector.length
    return vector
  }

  const prepare = (text: string) => encode(text, vocab, maxTokens)

  return {
    get dim() {
      return dim
    },
    prepare,
    run,
    async encode(texts, options = {}) {
      const out: Float32Array[] = []
      for (const text of texts) {
        if (options.signal?.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' })
        out.push(await run(prepare(text)))
        options.onProgress?.(out.length, texts.length)
      }
      return out
    },
  }
}

// ---- what gets embedded -------------------------------------------------------------------------------

// What the encoder is given for the page (the units: one per page element of each window) is decided in units.ts.

/**
 * Five fixed sentences for the parity test (spec 6.6, 9): the build-time (Node) and browser embeddings of
 * these must agree to cosine >= 0.999. They are plain text on purpose, with no facts or numbers about anyone.
 */
export const PARITY_SENTENCES: readonly string[] = [
  'Nearest-neighbour search over vectors finds the passages closest in meaning to a question.',
  'A bounded queue that drops the oldest item keeps latency flat when the consumer falls behind.',
  'Row-level policies stop one tenant from ever reading another tenant\'s rows.',
  'Every pull request is reviewed automatically and the findings are posted inline.',
  'Where did this answer come from? Every passage points back to the text it was cut from.',
]

// ---- embeddings.json -----------------------------------------------------------------------------------

/**
 * `dist/retrieval/embeddings.json`, written by scripts/embed-corpus.mjs when the encoder is published
 * (spec 6.6: `{ model, dim, sha256, vectors }`; `inputs` and the rest are additions).
 */
export interface EmbeddingsFile {
  model: string
  dim: number
  /** SHA-256 of the encoder file these vectors came from. */
  sha256: string
  pooling: 'mean'
  normalized: true
  maxTokens: number
  /** unit id (`${chunk id}#${part index}`, units.ts) -> base64 float32 vector. */
  vectors: Record<string, string>
  /** unit id -> FNV-1a of the exact input that was embedded; a changed page element no longer matches. */
  inputs: Record<string, string>
}

export function buildEmbeddingsFile(options: {
  sha256: string
  maxTokens?: number
  entries: ReadonlyArray<{ id: string; input: string; vector: Float32Array }>
}): EmbeddingsFile {
  const vectors: Record<string, string> = {}
  const inputs: Record<string, string> = {}
  for (const entry of options.entries) {
    vectors[entry.id] = encodeFloat32(entry.vector)
    inputs[entry.id] = fnv1a(entry.input)
  }
  return {
    model: EMBEDDINGS_MODEL,
    dim: options.entries[0]?.vector.length ?? EMBED_DIM,
    sha256: options.sha256,
    pooling: 'mean',
    normalized: true,
    maxTokens: options.maxTokens ?? MAX_TOKENS,
    vectors,
    inputs,
  }
}

export interface ReadEmbeddings {
  /** One entry per expected unit: the vector, or null when the file has none for it or it is stale. */
  vectors: Array<Float32Array | null>
  /** Vectors taken from the file. */
  reused: number
  /** Units the file did not cover (missing, or made from different text): these must be embedded here. */
  stale: number
}

/** Take what a (possibly stale, possibly absent) embeddings file can offer for the page elements of the current corpus. */
export function readEmbeddings(file: unknown, expected: ReadonlyArray<{ id: string; input: string }>, dim: number | null = null): ReadEmbeddings {
  const none: ReadEmbeddings = { vectors: expected.map(() => null), reused: 0, stale: expected.length }
  if (typeof file !== 'object' || file === null) return none
  const f = file as Partial<EmbeddingsFile>
  if (typeof f.vectors !== 'object' || f.vectors === null || typeof f.inputs !== 'object' || f.inputs === null || typeof f.dim !== 'number') return none
  if (dim !== null && f.dim !== dim) return none
  const vectors: ReadEmbeddings['vectors'] = []
  let reused = 0
  for (const item of expected) {
    const encoded = f.vectors[item.id]
    if (typeof encoded === 'string' && f.inputs[item.id] === fnv1a(item.input)) {
      try {
        vectors.push(decodeFloat32(encoded, f.dim))
        reused += 1
        continue
      } catch {
        /* a corrupt entry is as good as a missing one */
      }
    }
    vectors.push(null)
  }
  return { vectors, reused, stale: expected.length - reused }
}

// ---- the parity fixture ------------------------------------------------------------------------------------

/**
 * `src/lib/retrieval/parity-fixture.json`: the five parity sentences as the BROWSER path embedded them. The
 * Node build embeds the same five with the same code and scripts/parity.test.mjs holds the two to cosine >= 0.999.
 * It is produced once by a real run (the retrieval worker reports `parity` when it loads the model), never typed in.
 */
export interface ParityFixture {
  model: string
  dim: number
  /** `'browser'` once a real browser run filled it in; null while it is still the empty template. */
  generatedBy: 'browser' | null
  generatedAt: string | null
  sentences: string[]
  /** One base64 float32 vector per sentence, or null in the template. */
  vectors: string[] | null
}

export function buildParityFixture(vectors: readonly Float32Array[], generatedAt: string): ParityFixture {
  return {
    model: EMBEDDINGS_MODEL,
    dim: vectors[0]?.length ?? EMBED_DIM,
    generatedBy: 'browser',
    generatedAt,
    sentences: [...PARITY_SENTENCES],
    vectors: vectors.map((vector) => encodeFloat32(vector)),
  }
}

/** Cosine between each fixture vector and the matching fresh one. Throws when the fixture is a template or the counts differ. */
export function parityCosines(fixture: ParityFixture, fresh: readonly Float32Array[]): number[] {
  if (!fixture.vectors) throw new Error('The parity fixture has no vectors yet')
  if (fixture.vectors.length !== fresh.length) throw new Error('The parity fixture and the fresh embeddings differ in length')
  return fixture.vectors.map((encoded, i) => cosine(decodeFloat32(encoded, fresh[i].length), fresh[i]))
}
