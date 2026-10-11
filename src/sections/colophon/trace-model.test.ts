import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyBuildInfo, type BuildInfo } from '../../prerender/build-info.ts'
import { fetchBuildInfo, formatBuilt, parseBuildInfo, splitCsp, toTrace } from './trace-model.ts'

const CSP =
  "default-src 'self'; script-src 'self' 'sha256-abc='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; upgrade-insecure-requests"

/** Shaped like the real file the prerender writes; the numbers are test data, not claims about the site. */
const SAMPLE: BuildInfo = {
  version: 'v3.0',
  builtAt: '2026-10-11T12:12:29.703Z',
  commit: 'abc1234',
  html: { file: 'index.html', bytes: 45000, gzipBytes: 11000 },
  css: [{ file: 'assets/style-x.css', bytes: 40000, gzipBytes: 12000 }],
  js: [
    { file: 'assets/gsap-x.js', bytes: 69000, gzipBytes: 27000, kind: 'chunk', name: 'gsap', initial: false },
    { file: 'assets/react-x.js', bytes: 190000, gzipBytes: 59000, kind: 'chunk', name: 'react', initial: true },
    { file: 'assets/index-x.js', bytes: 100000, gzipBytes: 36000, kind: 'entry', name: 'index', initial: true },
    { file: 'assets/policy.worker-x.js', bytes: 1400, gzipBytes: 700, kind: 'worker', name: 'policy.worker', initial: false },
  ],
  fonts: [
    { file: 'assets/big-shoulders-latin-x.woff2', bytes: 36000, gzipBytes: 36000, family: 'big-shoulders', subset: 'latin' },
    { file: 'assets/atkinson-latin-x.woff2', bytes: 34000, gzipBytes: 34000, family: 'atkinson-hyperlegible-next', subset: 'latin' },
    { file: 'assets/atkinson-latin-ext-x.woff2', bytes: 19000, gzipBytes: 19000, family: 'atkinson-hyperlegible-next', subset: 'latin-ext' },
  ],
  assets: [
    { path: 'ort/ort-wasm-simd-threaded.wasm', label: 'ONNX Runtime WASM (SIMD build)', bytes: 14239897, present: true },
    { path: 'models/minilm/model_quantized.onnx', label: 'all-MiniLM-L6-v2 encoder (int8)', bytes: 0, present: false },
  ],
  csp: CSP,
  routes: ['/', '/resume/'],
}

test('a well-formed build-info.json is accepted unchanged; the empty one the dev server uses is too', () => {
  assert.deepEqual(parseBuildInfo(JSON.parse(JSON.stringify(SAMPLE))), SAMPLE)
  assert.ok(parseBuildInfo(emptyBuildInfo()))
  assert.ok(parseBuildInfo({ ...SAMPLE, commit: null }))
})

test('anything missing or mistyped is rejected, never half-read', () => {
  for (const bad of [
    null, 'text', [], {},
    { ...SAMPLE, version: 3 },
    { ...SAMPLE, html: { file: 'x', bytes: '1', gzipBytes: 2 } },
    { ...SAMPLE, css: 'none' },
    { ...SAMPLE, js: [{ ...SAMPLE.js[0], kind: 'script' }] },
    { ...SAMPLE, js: [{ ...SAMPLE.js[0], initial: 'yes' }] },
    { ...SAMPLE, fonts: [{ ...SAMPLE.fonts[0], family: undefined }] },
    { ...SAMPLE, assets: [{ ...SAMPLE.assets[0], present: 1 }] },
    { ...SAMPLE, js: [{ ...SAMPLE.js[0], bytes: -1 }] },
    { ...SAMPLE, csp: undefined },
    { ...SAMPLE, routes: [1] },
  ]) {
    assert.equal(parseBuildInfo(bad), null)
  }
})

test('the view lists every chunk, largest gzip first, with the right initial and on-demand totals', () => {
  const view = toTrace(SAMPLE)
  assert.deepEqual(view.js.map((chunk) => chunk.name), ['react', 'index', 'gsap', 'policy.worker'])
  assert.equal(view.js.length, SAMPLE.js.length, 'every chunk is listed')
  assert.equal(view.js[0].share, 1)
  assert.ok(view.js.every((chunk) => chunk.share > 0 && chunk.share <= 1))
  assert.deepEqual(view.jsTotals, { initialGzip: 95000, initialFiles: 2, lazyGzip: 27700, lazyFiles: 2 })
})

test('the two groups split the same files: what loads first, and what loads on demand, each largest first', () => {
  const view = toTrace(SAMPLE)
  assert.deepEqual(view.groups.initial.map((chunk) => chunk.name), ['react', 'index'])
  assert.deepEqual(view.groups.lazy.map((chunk) => chunk.name), ['gsap', 'policy.worker'])
  assert.equal(view.groups.initial.length + view.groups.lazy.length, view.js.length)
  assert.ok(view.groups.initial.every((chunk) => chunk.initial) && view.groups.lazy.every((chunk) => !chunk.initial))
})

test('sizes, fonts (latin versus the rest), assets and the version line pass through as measured', () => {
  const view = toTrace(SAMPLE)
  assert.deepEqual(view.html, { bytes: 45000, gzipBytes: 11000 })
  assert.deepEqual(view.css, { bytes: 40000, gzipBytes: 12000, files: 1 })
  assert.deepEqual(view.fonts.latin, [
    { family: 'atkinson-hyperlegible-next', bytes: 34000 },
    { family: 'big-shoulders', bytes: 36000 },
  ])
  assert.equal(view.fonts.latinBytes, 70000)
  assert.deepEqual(view.fonts.other, { files: 1, bytes: 19000 })
  assert.deepEqual(view.assets, SAMPLE.assets)
  assert.equal(view.built, '2026-10-11 12:12 UTC')
  assert.equal(view.commit, 'abc1234')
  assert.equal(view.version, 'v3.0')
})

test('the CSP is carried verbatim, and split one directive per line without losing a character', () => {
  const view = toTrace(SAMPLE)
  assert.equal(view.csp.text, CSP)
  assert.equal(view.csp.directives[0], "default-src 'self';")
  assert.equal(view.csp.directives.at(-1), 'upgrade-insecure-requests')
  assert.equal(view.csp.directives.join(' '), CSP)
  assert.deepEqual(splitCsp(''), [])
  assert.deepEqual(splitCsp("a 'self'"), ["a 'self'"])
})

test('formatBuilt shortens ISO timestamps and leaves anything else alone', () => {
  assert.equal(formatBuilt('2026-10-11T12:12:29.703Z'), '2026-10-11 12:12 UTC')
  assert.equal(formatBuilt('yesterday'), 'yesterday')
  assert.equal(formatBuilt('2026-10-11T12:12:29+05:30'), '2026-10-11T12:12:29+05:30')
})

test('fetchBuildInfo returns the validated file, and null for a 404, HTML, bad JSON or a network error', async () => {
  const ok = (body: unknown) => async () => ({ ok: true, json: async () => body })
  assert.deepEqual(await fetchBuildInfo({ fetch: ok(SAMPLE) }), SAMPLE)
  assert.equal(await fetchBuildInfo({ fetch: async () => ({ ok: false, json: async () => SAMPLE }) }), null)
  assert.equal(await fetchBuildInfo({ fetch: async () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token <') } }) }), null)
  assert.equal(await fetchBuildInfo({ fetch: ok({ nope: true }) }), null)
  assert.equal(await fetchBuildInfo({ fetch: async () => { throw new Error('offline') } }), null)
})
