// Builds the retrieval corpus (spec 6.6): the home page's own text, cut into 256-wordpiece windows with a
// stride of 192 (64 overlap), never crossing a section boundary. Runs before `vite` (see package.json:
// `dev` and `build`) under Node type stripping: erasable TypeScript only, explicit `.ts` extensions.
//
//   node scripts/build-corpus.ts [--out public/retrieval]
//
// Input   src/data/copy.ts + src/data/portfolio.ts (through src/lib/retrieval/page-records.ts), so the
//         index is built from the same strings the page renders; public/models/minilm/vocab.txt for the
//         wordpiece counts (if it is missing the windows count words instead and the corpus says so).
// Output  <out>/corpus.json: sorted keys, one trailing newline, byte-identical for identical input.
//         Also records which model files exist (so the page knows whether to offer the embedding model
//         without probing the network) and their sizes.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { profile } from '../src/data/portfolio.ts'
import { buildCorpus, serializeCorpus, type Corpus, type CorpusAsset } from '../src/lib/retrieval/corpus.ts'
import { SECTIONS, pageRecords } from '../src/lib/retrieval/page-records.ts'
import { parseVocab, type Vocab } from '../src/lib/retrieval/wordpiece.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public')

const flag = process.argv.indexOf('--out')
const out = resolve(flag > 0 ? (process.argv[flag + 1] ?? 'public/retrieval') : 'public/retrieval')

function asset(path: string): CorpusAsset | null {
  const file = join(PUBLIC, path)
  return existsSync(file) ? { path, bytes: statSync(file).size } : null
}

let vocab: Vocab | null = null
let vocabAsset: Corpus['assets']['vocab'] = null
const vocabFile = join(PUBLIC, 'models', 'minilm', 'vocab.txt')
if (existsSync(vocabFile)) {
  const bytes = readFileSync(vocabFile)
  vocab = parseVocab(bytes.toString('utf8'))
  vocabAsset = {
    path: 'models/minilm/vocab.txt',
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    entries: vocab.size,
  }
}

const corpus = buildCorpus({
  sections: SECTIONS,
  records: pageRecords(),
  vocab,
  assets: {
    vocab: vocabAsset,
    encoder: asset('models/minilm/model_quantized.onnx'),
    runtime: asset('ort/ort-wasm-simd-threaded.wasm'),
  },
})

if (corpus.chunks.length === 0) throw new Error('build-corpus: the page produced no chunks. Check src/lib/retrieval/page-records.ts.')

const json = serializeCorpus(corpus)

// The phone number is on the page (owner decision) but must not reach a public data file.
const digits = profile.phone.replace(/\D/g, '')
const squashed = json.replace(/[\s\-+().]/g, '')
if (digits.length >= 8 && squashed.includes(digits)) {
  throw new Error('build-corpus: the phone number reached corpus.json. It must stay out of every machine-readable file.')
}

mkdirSync(out, { recursive: true })
const target = join(out, 'corpus.json')
const unchanged = existsSync(target) && readFileSync(target, 'utf8') === json
if (!unchanged) writeFileSync(target, json)

const tokens = corpus.sections.reduce((sum, section) => sum + section.tokens, 0)
const text = corpus.chunks.reduce((sum, chunk) => sum + chunk.text.length, 0)
console.log(
  `build-corpus: ${unchanged ? 'unchanged' : 'wrote'} ${target} (${corpus.chunks.length} chunks in ${corpus.sections.length} sections, ` +
    `${tokens} ${corpus.tokenizer === 'wordpiece' ? 'wordpieces' : 'words'}, ${text} characters, ${(json.length / 1000).toFixed(1)} KB)`,
)
if (corpus.tokenizer === 'words') {
  console.log('build-corpus: public/models/minilm/vocab.txt is missing, so windows count words, not wordpieces. See public/models/README.md.')
}
console.log(
  corpus.assets.encoder
    ? `build-corpus: embedding model published (${(corpus.assets.encoder.bytes / 1e6).toFixed(2)} MB); the tap will be offered.`
    : 'build-corpus: no embedding model published; BM25 only.',
)
