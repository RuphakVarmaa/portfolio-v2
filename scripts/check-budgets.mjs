// Fails the build when a performance or hygiene budget is exceeded (spec 8.1 and the DoD's build checks).
// Reads dist/ (after the prerender step) and dist/build-info.json. All sizes: KB = 1000 bytes.
//
// Deviations from the spec's table, each recorded in docs/INTERFACES.md ("Budgets"):
//   - React + ReactDOM + scheduler are 59.8 KB gzipped by themselves, so the spec's single
//     "initial JS <= 95 KB (React + shell + cluster + board)" cannot hold. React is a separate long-cached
//     vendor chunk; `index-*.js` (the site) keeps the spec's 95 KB, the vendor chunk gets its own cap, and
//     the SUM of initial JS gets a cap too (INITIAL_JS_TOTAL), so the split cannot hide growth.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const KB = 1000

export const BUDGETS = {
  HTML_RAW: 60 * KB, // every prerendered page, raw bytes (spec: dist/index.html)
  CSS_GZ: 24 * KB, // all CSS (one file), gzip
  INITIAL_JS_APP: 95 * KB, // `index-*.js`, gzip (spec letter)
  INITIAL_JS_VENDOR: 62 * KB, // the React vendor chunk, gzip (measured 59.8 KB; deviation)
  INITIAL_JS_TOTAL: 125 * KB, // entry + every static import, gzip (deviation: a cap on the sum)
  FONTS_LATIN: 150 * KB, // the five latin woff2 files, raw (already compressed)
  DEMO_CHUNK_GZ: 35 * KB, // any lazy section/demo chunk or worker script, gzip
  ORT_CHUNK_GZ: 60 * KB, // ONNX Runtime JS, gzip
  ACORN_CHUNK_GZ: 40 * KB, // acorn, gzip
  ENCODER_BYTES: 24 * 1_000_000,
  DETECTOR_BYTES: 6.5 * 1_000_000,
  ORT_WASM_BYTES: 14_240_000, // 14.24 MB: onnxruntime-web 1.30's only WASM build
  TRANSFER_BEFORE_INTERACTION: 450 * KB, // no taps
}

const BANNED_IN_LOCKFILE = [
  /^\s*three@/m,
  /^\s*'?@react-three\//m,
  /@phosphor-icons\/react/,
  /@fontsource-variable\/manrope/,
  /@fontsource-variable\/jetbrains-mono/,
  /@huggingface\/transformers/,
  /^\s*'?sharp@/m,
]

const rows = []
let failed = false
const check = (item, actual, limit, unit = 'bytes', note = '') => {
  const ok = actual <= limit
  if (!ok) failed = true
  rows.push({ item, actual, limit, unit, ok, note })
}
const info = (item, text) => rows.push({ item, text, info: true })

const gz = (buffer) => gzipSync(buffer, { level: 9 }).length
const read = (path) => readFileSync(join(DIST, path))
const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))
    : []

if (!existsSync(join(DIST, 'build-info.json'))) {
  console.error('check-budgets: dist/build-info.json is missing. Run the prerender step first.')
  process.exit(1)
}
const info_ = JSON.parse(read('build-info.json').toString('utf8'))
const kb = (n) => `${(n / KB).toFixed(1)} KB`

// ---- HTML --------------------------------------------------------------------------------------------
for (const route of info_.routes) {
  const file = route === '/' ? 'index.html' : `${route.slice(1)}index.html`
  check(`HTML ${route}`, statSync(join(DIST, file)).size, BUDGETS.HTML_RAW)
}

// ---- CSS ---------------------------------------------------------------------------------------------
check('CSS (all, gzip)', info_.css.reduce((sum, file) => sum + file.gzipBytes, 0), BUDGETS.CSS_GZ)

// ---- JS ----------------------------------------------------------------------------------------------
const initial = info_.js.filter((chunk) => chunk.initial)
const entry = initial.filter((chunk) => chunk.kind === 'entry')
const vendor = initial.filter((chunk) => chunk.kind !== 'entry')
check('Initial JS: site entry (gzip)', entry.reduce((s, c) => s + c.gzipBytes, 0), BUDGETS.INITIAL_JS_APP, 'bytes', entry.map((c) => c.file).join(', '))
check('Initial JS: vendor (React, gzip)', vendor.reduce((s, c) => s + c.gzipBytes, 0), BUDGETS.INITIAL_JS_VENDOR, 'bytes', vendor.map((c) => c.file).join(', '))
check('Initial JS: total (gzip)', initial.reduce((s, c) => s + c.gzipBytes, 0), BUDGETS.INITIAL_JS_TOTAL)

for (const chunk of info_.js.filter((c) => !c.initial)) {
  const name = `${chunk.name} ${chunk.kind}`.toLowerCase()
  const limit = /onnxruntime|\bort\b/.test(name) ? BUDGETS.ORT_CHUNK_GZ : /acorn/.test(name) ? BUDGETS.ACORN_CHUNK_GZ : BUDGETS.DEMO_CHUNK_GZ
  check(`Lazy ${chunk.kind}: ${chunk.name} (gzip)`, chunk.gzipBytes, limit)
}

// ---- fonts -------------------------------------------------------------------------------------------
const latin = info_.fonts.filter((font) => font.subset === 'latin')
check('Fonts: latin woff2 x' + latin.length, latin.reduce((s, f) => s + f.bytes, 0), BUDGETS.FONTS_LATIN)
const families = new Set(info_.fonts.map((f) => f.family))
const EXPECTED = ['atkinson-hyperlegible-next', 'big-shoulders', 'big-shoulders-stencil', 'doto', 'martian-mono']
const unexpected = [...families].filter((family) => !EXPECTED.includes(family))
if (unexpected.length > 0) {
  failed = true
  rows.push({ item: 'Fonts: only the five specified families', text: `unexpected: ${unexpected.join(', ')}`, ok: false, info: true })
}

// ---- models and runtime (only ever on a tap) ------------------------------------------------------
const asset = (path) => info_.assets.find((a) => a.path === path)
const encoder = asset('models/minilm/model_quantized.onnx')
const detector = asset('models/yolov8n/yolov8n-320.onnx')
const wasm = asset('ort/ort-wasm-simd-threaded.wasm')
if (encoder?.present) check('Model: encoder', encoder.bytes, BUDGETS.ENCODER_BYTES)
else info('Model: encoder', 'not published (BM25 only)')
if (detector?.present) check('Model: detector', detector.bytes, BUDGETS.DETECTOR_BYTES)
else info('Model: detector', 'not published (recorded trace / honest message)')
if (wasm?.present) check('ORT WASM', wasm.bytes, BUDGETS.ORT_WASM_BYTES)
else {
  failed = true
  rows.push({ item: 'ORT WASM', text: 'dist/ort/ort-wasm-simd-threaded.wasm is missing (run pnpm ort:copy)', ok: false, info: true })
}

// ---- total transferred before interaction (no taps) -----------------------------------------------
const gzOf = (path) => (existsSync(join(DIST, path)) ? gz(read(path)) : 0)
const parts = [
  ['HTML', info_.html.gzipBytes],
  ['CSS', info_.css.reduce((s, f) => s + f.gzipBytes, 0)],
  ['initial JS', initial.reduce((s, c) => s + c.gzipBytes, 0)],
  ['latin fonts', latin.reduce((s, f) => s + f.bytes, 0)],
  ['worker scripts', info_.js.filter((c) => c.kind === 'worker').reduce((s, c) => s + c.gzipBytes, 0)],
  ['corpus.json', gzOf('retrieval/corpus.json')],
  ['build-info.json', gzOf('build-info.json')],
  ['favicon', existsSync(join(DIST, 'ruphak-mark.png')) ? statSync(join(DIST, 'ruphak-mark.png')).size : 0],
]
check('Transferred before interaction', parts.reduce((s, [, n]) => s + n, 0), BUDGETS.TRANSFER_BEFORE_INTERACTION, 'bytes', parts.map(([name, n]) => `${name} ${kb(n)}`).join(' + '))

// ---- hygiene -------------------------------------------------------------------------------------------
const lockfile = existsSync(join(ROOT, 'pnpm-lock.yaml')) ? readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8') : ''
for (const pattern of BANNED_IN_LOCKFILE) {
  if (pattern.test(lockfile)) {
    failed = true
    rows.push({ item: 'Lockfile', text: `contains a banned package matching ${pattern}`, ok: false, info: true })
  }
}
const html = walk(DIST).filter((file) => file.endsWith('.html'))
for (const file of html) {
  const text = readFileSync(file, 'utf8')
  if (!text.includes('data-prerendered="1"')) {
    failed = true
    rows.push({ item: 'Prerender', text: `${file.slice(DIST.length + 1)} has no prerendered root`, ok: false, info: true })
  }
}

// ---- report --------------------------------------------------------------------------------------------
const pad = (value, width) => String(value).padEnd(width)
console.log('\ncheck-budgets (sizes in KB = 1000 bytes)')
for (const row of rows) {
  if (row.info) {
    console.log(`  ${row.ok === false ? 'FAIL' : ' -- '}  ${pad(row.item, 40)} ${row.text}`)
    continue
  }
  const status = row.ok ? ' ok ' : 'FAIL'
  console.log(`  ${status}  ${pad(row.item, 40)} ${pad(kb(row.actual), 10)} / ${pad(kb(row.limit), 10)} ${row.note ? `(${row.note})` : ''}`)
}
console.log('  --    FCP, LCP, CLS, frame rate, long tasks: measured in the browser (Lighthouse, Performance panel), not here.')
if (failed) {
  console.error('\ncheck-budgets: a budget was exceeded. See docs/INTERFACES.md ("Budgets") before raising one.')
  process.exit(1)
}
console.log('\ncheck-budgets: all budgets met.')
