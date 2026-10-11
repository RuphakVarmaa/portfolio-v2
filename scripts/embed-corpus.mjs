// Build step after the prerender (package.json: `build`): embeds the retrieval corpus at BUILD time with the
// same package, the same quantized encoder, the same tokenizer and the same pooling the browser uses
// (src/lib/retrieval/embed.ts), so the page can take the vectors from dist/retrieval/embeddings.json and only
// embed the visitor's question. Spec 6.6.
//
//   - runs only if public/models/minilm/model_quantized.onnx exists (the owner publishes it, see
//     public/models/README.md); without it: "BM25 only", exit 0, nothing written
//   - needs public/models/minilm/vocab.txt (the encoder's tokenizer)
//   - embeds the PAGE ELEMENTS of each window, not the window (src/lib/retrieval/units.ts says why; the worker
//     calls the same `embedUnits`, so the inputs are byte-identical)
//   - writes dist/retrieval/embeddings.json: { model, dim, sha256, pooling, normalized, maxTokens, vectors, inputs }
//     (vectors: Float32 base64 per unit id `${chunk id}#${part index}`; inputs: a hash of the exact text each
//     vector was made from)
//
// It also prints how much of the retrieval corpus can be found, verbatim, in the prerendered dist/index.html.
// That is information, never a failure: a citation scrolls to and underlines the sentence it can find on the
// page, and falls back to the section when it cannot.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// The defaults are the build's own paths. The flags exist so the script can be tried on other files
// (`node scripts/embed-corpus.mjs --model /tmp/model.onnx --out /tmp/embeddings.json`) without touching dist/.
const flag = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`)
  return at > 0 && process.argv[at + 1] ? resolve(process.argv[at + 1]) : fallback
}
const MODEL = flag('model', join(ROOT, 'public', 'models', 'minilm', 'model_quantized.onnx'))
const VOCAB = flag('vocab', join(ROOT, 'public', 'models', 'minilm', 'vocab.txt'))
const CORPUS = flag('corpus', join(ROOT, 'dist', 'retrieval', 'corpus.json'))
const OUT = flag('out', join(ROOT, 'dist', 'retrieval', 'embeddings.json'))
const HOME = flag('page', join(ROOT, 'dist', 'index.html'))
const ORT_DIST = join(ROOT, 'node_modules', 'onnxruntime-web', 'dist') + '/'

const lib = (name) => import(pathToFileURL(join(ROOT, 'src', 'lib', 'retrieval', name)).href)

// ---- 1. does the corpus appear on the prerendered page? (information only) ------------------------------------------

function pageText(html) {
  const decoded = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
  return decoded.replace(/\s+/g, '')
}

function reportCoverage(corpus) {
  if (!existsSync(HOME)) return
  const page = pageText(readFileSync(HOME, 'utf8'))
  let found = 0
  let hidden = 0
  const missing = []
  const seen = new Set()
  for (const chunk of corpus.chunks) {
    for (const part of chunk.parts) {
      const text = chunk.text.slice(part.from, part.to)
      const key = `${part.label}\u0000${text}`
      if (seen.has(key) || part.cut) continue // a part cut by a window is a fragment: its twin in the neighbour has the rest
      seen.add(key)
      if (page.includes(text.replace(/\s+/g, ''))) found += 1
      else if (part.depth && part.depth !== '30s') hidden += 1
      else missing.push(`${part.label}: ${text.slice(0, 60)}`)
    }
  }
  const total = found + hidden + missing.length
  console.log(
    `embed-corpus: page coverage: ${found} of ${total} passages are in dist/index.html verbatim; ${hidden} more are the Engineer and Peer depths (on the page one depth at a time); ${missing.length} not found.`,
  )
  for (const line of missing.slice(0, 12)) console.log(`embed-corpus:   not on the prerendered page: ${line}`)
  if (missing.length > 12) console.log(`embed-corpus:   ... and ${missing.length - 12} more`)
}

if (!existsSync(CORPUS)) {
  console.error('embed-corpus: dist/retrieval/corpus.json is missing. Run the build (it copies public/retrieval/ into dist/).')
  process.exit(1)
}
const corpus = JSON.parse(readFileSync(CORPUS, 'utf8'))
reportCoverage(corpus)

// ---- 2. embeddings (only when the encoder is published) --------------------------------------------------------------

if (!existsSync(MODEL)) {
  console.log('embed-corpus: no embedding model published (public/models/minilm/); BM25 only. Skipping.')
  process.exit(0)
}
if (!existsSync(VOCAB)) {
  console.error('embed-corpus: public/models/minilm/vocab.txt is missing; the encoder cannot be used without its vocabulary. See public/models/README.md.')
  process.exit(1)
}
if (corpus.tokenizer !== 'wordpiece') {
  console.error('embed-corpus: the corpus was cut by words, not wordpieces (it was built without vocab.txt). Rebuild the corpus first.')
  process.exit(1)
}

const { parseVocab } = await lib('wordpiece.ts')
const { createEncoder, buildEmbeddingsFile } = await lib('embed.ts')
const { embedUnits } = await lib('units.ts')
const ort = await import('onnxruntime-web') // the Node entry of the same package the browser runs
ort.env.wasm.numThreads = 1
ort.env.wasm.wasmPaths = ORT_DIST

const started = performance.now()
const modelBytes = readFileSync(MODEL)
const session = await ort.InferenceSession.create(new Uint8Array(modelBytes), { executionProviders: ['wasm'] })
const encoder = createEncoder(ort, session, parseVocab(readFileSync(VOCAB, 'utf8')))

const items = embedUnits(corpus).map((unit) => ({ id: unit.id, input: unit.input }))
const vectors = await encoder.encode(items.map((item) => item.input))
const file = buildEmbeddingsFile({
  sha256: createHash('sha256').update(modelBytes).digest('hex'),
  entries: items.map((item, i) => ({ ...item, vector: vectors[i] })),
})
await session.release()

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(file) + '\n')
console.log(
  `embed-corpus: wrote ${relative(ROOT, OUT)} (${items.length} page elements x ${file.dim} dims, ${(statSync(OUT).size / 1000).toFixed(1)} KB) ` +
    `with ${(modelBytes.length / 1e6).toFixed(2)} MB ${file.model} in ${Math.round(performance.now() - started)} ms`,
)
