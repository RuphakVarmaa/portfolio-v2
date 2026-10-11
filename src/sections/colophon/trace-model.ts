/**
 * The Colophon's build trace: `dist/build-info.json` (written by scripts/prerender.mjs from the real files in
 * dist/) turned into what the page shows. Every number is a file size or a hash the build measured; nothing
 * here is estimated. The file is fetched from the site's own origin at run time, so it can be missing (a dev
 * server), stale or malformed: `parseBuildInfo` validates it and `fetchBuildInfo` returns null rather than
 * guess.
 *
 * Pure apart from `fetch` (injectable), so it runs under Node type stripping for the tests.
 */
import type { BuildAsset, BuildChunk, BuildFile, BuildFont, BuildInfo } from '../../prerender/build-info.ts'
import { BUILD_INFO_PATH } from './build-info-path.ts'

export { BUILD_INFO_PATH }

// ---- validation ------------------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const isText = (value: unknown): value is string => typeof value === 'string'

function readFile(value: unknown): BuildFile | null {
  if (!isRecord(value) || !isText(value.file) || !isNumber(value.bytes) || !isNumber(value.gzipBytes)) return null
  return { file: value.file, bytes: value.bytes, gzipBytes: value.gzipBytes }
}

function readList<T>(value: unknown, read: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null
  const out: T[] = []
  for (const item of value) {
    const parsed = read(item)
    if (parsed === null) return null
    out.push(parsed)
  }
  return out
}

function readChunk(value: unknown): BuildChunk | null {
  const file = readFile(value)
  if (!file || !isRecord(value)) return null
  const { kind, name, initial } = value
  if ((kind !== 'entry' && kind !== 'chunk' && kind !== 'worker') || !isText(name) || typeof initial !== 'boolean') return null
  return { ...file, kind, name, initial }
}

function readFont(value: unknown): BuildFont | null {
  const file = readFile(value)
  if (!file || !isRecord(value) || !isText(value.family) || !isText(value.subset)) return null
  return { ...file, family: value.family, subset: value.subset }
}

function readAsset(value: unknown): BuildAsset | null {
  if (!isRecord(value) || !isText(value.path) || !isText(value.label) || !isNumber(value.bytes) || typeof value.present !== 'boolean') return null
  return { path: value.path, label: value.label, bytes: value.bytes, present: value.present }
}

/** Validate a parsed `build-info.json`. Null when anything is missing or has the wrong type. */
export function parseBuildInfo(value: unknown): BuildInfo | null {
  if (!isRecord(value)) return null
  const { version, builtAt, commit, csp, routes } = value
  const html = readFile(value.html)
  const css = readList(value.css, readFile)
  const js = readList(value.js, readChunk)
  const fonts = readList(value.fonts, readFont)
  const assets = readList(value.assets, readAsset)
  if (!isText(version) || !isText(builtAt) || !(commit === null || isText(commit)) || !isText(csp)) return null
  if (!html || !css || !js || !fonts || !assets) return null
  if (!Array.isArray(routes) || !routes.every(isText)) return null
  return { version, builtAt, commit, html, css, js, fonts, assets, csp, routes }
}

export interface FetchDeps {
  fetch?: (url: string, init?: { cache?: 'no-cache' | 'default'; signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>
  signal?: AbortSignal
}

/** Fetch and validate `/build-info.json`. Null on any failure (network, status, not JSON, wrong shape). */
export async function fetchBuildInfo(deps: FetchDeps = {}): Promise<BuildInfo | null> {
  const doFetch = deps.fetch ?? ((url, init) => fetch(url, init))
  try {
    const response = await doFetch(BUILD_INFO_PATH, { cache: 'no-cache', signal: deps.signal })
    if (!response.ok) return null
    return parseBuildInfo(await response.json())
  } catch {
    return null
  }
}

// ---- the view --------------------------------------------------------------------------------------

export interface TraceChunk {
  file: string
  name: string
  kind: BuildChunk['kind']
  /** Loads before the page is interactive (the entry and everything it imports statically). */
  initial: boolean
  bytes: number
  gzipBytes: number
  /** gzip size relative to the largest chunk, 0 to 1, for the bar. */
  share: number
}

export interface TraceView {
  version: string
  /** `2026-10-11 12:12 UTC`, or the raw text when it is not an ISO timestamp. */
  built: string
  commit: string | null
  html: { bytes: number; gzipBytes: number }
  css: { bytes: number; gzipBytes: number; files: number }
  /** Every JS file, largest gzip first. */
  js: TraceChunk[]
  /** The same files in two groups, each largest first: what loads before the page is interactive, and what loads only when asked. */
  groups: { initial: TraceChunk[]; lazy: TraceChunk[] }
  jsTotals: { initialGzip: number; initialFiles: number; lazyGzip: number; lazyFiles: number }
  fonts: {
    /** The latin subset of each family: the files an English page downloads. */
    latin: Array<{ family: string; bytes: number }>
    latinBytes: number
    /** Every other subset: shipped, fetched only when a page uses their characters. */
    other: { files: number; bytes: number }
  }
  assets: BuildAsset[]
  csp: { text: string; directives: string[] }
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

/** `2026-10-11T12:12:29.703Z` -> `2026-10-11 12:12 UTC`. Anything else is shown as given. */
export function formatBuilt(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso)
  return match && iso.endsWith('Z') ? `${match[1]} ${match[2]} UTC` : iso
}

/** The policy, one directive per entry, each keeping its closing `;` (the last one has none, as in the source). */
export function splitCsp(csp: string): string[] {
  const parts = csp.split('; ').filter((part) => part.length > 0)
  return parts.map((part, index) => (index < parts.length - 1 && !part.endsWith(';') ? `${part};` : part))
}

export function toTrace(info: BuildInfo): TraceView {
  const largest = Math.max(1, ...info.js.map((chunk) => chunk.gzipBytes))
  const js = info.js
    .map((chunk): TraceChunk => ({ file: chunk.file, name: chunk.name, kind: chunk.kind, initial: chunk.initial, bytes: chunk.bytes, gzipBytes: chunk.gzipBytes, share: chunk.gzipBytes / largest }))
    .sort((a, b) => b.gzipBytes - a.gzipBytes || a.file.localeCompare(b.file))
  const initial = js.filter((chunk) => chunk.initial)
  const lazy = js.filter((chunk) => !chunk.initial)
  const latin = info.fonts.filter((font) => font.subset === 'latin')
  const other = info.fonts.filter((font) => font.subset !== 'latin')
  return {
    version: info.version,
    built: formatBuilt(info.builtAt),
    commit: info.commit,
    html: { bytes: info.html.bytes, gzipBytes: info.html.gzipBytes },
    css: { bytes: sum(info.css.map((file) => file.bytes)), gzipBytes: sum(info.css.map((file) => file.gzipBytes)), files: info.css.length },
    js,
    groups: { initial, lazy },
    jsTotals: { initialGzip: sum(initial.map((c) => c.gzipBytes)), initialFiles: initial.length, lazyGzip: sum(lazy.map((c) => c.gzipBytes)), lazyFiles: lazy.length },
    fonts: {
      latin: latin.map((font) => ({ family: font.family, bytes: font.bytes })).sort((a, b) => a.family.localeCompare(b.family)),
      latinBytes: sum(latin.map((font) => font.bytes)),
      other: { files: other.length, bytes: sum(other.map((font) => font.bytes)) },
    },
    assets: info.assets,
    csp: { text: info.csp, directives: splitCsp(info.csp) },
  }
}
