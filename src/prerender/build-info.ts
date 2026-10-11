/**
 * What the build writes to `dist/build-info.json` (the Colophon fetches it) and hands to
 * `buildAgentFiles`. Produced by scripts/prerender.mjs from the Vite manifest and the files in dist/;
 * every number is a real file size, never an estimate.
 */

export interface BuildFile {
  /** Path inside dist/, e.g. `assets/index-abc123.js`. */
  file: string
  bytes: number
  /** gzip size (zlib level 9). Fonts and images are already compressed; their `gzipBytes` equals `bytes`. */
  gzipBytes: number
}

export interface BuildChunk extends BuildFile {
  /** `entry` is the initial JS; `chunk` a lazy chunk; `worker` a Web Worker script. */
  kind: 'entry' | 'chunk' | 'worker'
  /** A short readable name from the source path, e.g. `retrieval` or `onnxruntime-web`. */
  name: string
  /** True for the entry chunk and every chunk it imports statically (what loads before anything is interactive). */
  initial: boolean
}

export interface BuildFont extends BuildFile {
  family: string
  /** `latin`, `latin-ext`, ... The browser only downloads the subsets the page uses. */
  subset: string
}

export interface BuildAsset {
  /** Path inside dist/, e.g. `ort/ort-wasm-simd-threaded.wasm`. */
  path: string
  label: string
  bytes: number
  /** False when the file is not published (models are owner-provided). */
  present: boolean
}

export interface BuildInfo {
  /** Site version string, e.g. `v3.0`. */
  version: string
  /** ISO timestamp of the build. */
  builtAt: string
  /** Short git commit hash when available. */
  commit: string | null
  html: BuildFile
  css: BuildFile[]
  js: BuildChunk[]
  fonts: BuildFont[]
  assets: BuildAsset[]
  /** The Content-Security-Policy meta content, verbatim. */
  csp: string
  /** Prerendered route paths, e.g. `/`, `/projects/retrieval/`. */
  routes: string[]
}

/** A valid, empty BuildInfo for tests and for the dev server (where no build has run). */
export function emptyBuildInfo(): BuildInfo {
  const none: BuildFile = { file: '', bytes: 0, gzipBytes: 0 }
  return {
    version: 'v3.0',
    builtAt: '1970-01-01T00:00:00.000Z',
    commit: null,
    html: none,
    css: [],
    js: [],
    fonts: [],
    assets: [],
    csp: '',
    routes: ['/'],
  }
}
