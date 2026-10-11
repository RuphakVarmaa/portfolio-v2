import { COCO_CLASSES } from './coco-classes.ts'
import { INPUT_SIZE } from './letterbox.ts'
import type { DetectorMeta } from './types.ts'

/**
 * What the owner has published for the Vision service: the detector (`models/yolov8n/`), a recorded trace
 * (`traces/vision.json`) and the 4 s clip (`media/desk.mp4`). Each is optional; the panel is honest about
 * every one that is missing (spec 6.7 and the owner's override: no files are bundled).
 *
 * How the panel finds out WITHOUT asking for files that are not there: probing a missing file makes the
 * browser print a red 404 in the console. So the production site reads the build's own inventory,
 * `/build-info.json` (the Colophon fetches it too), which lists whether each file was present when the
 * site was built, and only fetches `metadata.json` when the model is listed as present. Only the dev
 * server, which has no build-info.json, probes directly.
 *
 * SPEC-GAP (foundation, `scripts/prerender.mjs`, the `optional` list that becomes `build-info.json`
 * `assets`): it must also list `traces/vision.json` and `media/desk.mp4`, for example
 * `['traces/vision.json', 'Recorded vision run']` and `['media/desk.mp4', 'Recorded clip (4 s)']`. Until it
 * does, an inventory that does not mention a path reads as "not published", so a clip or a trace the owner
 * adds would not be offered by the production site (the detector is already listed).
 *
 * Pure TypeScript with injected fetch functions, tested in availability.test.ts.
 */

/** Paths inside `dist/` (and `public/`), without a leading slash, exactly as build-info.json lists them. */
export const ASSET_PATHS = {
  model: 'models/yolov8n/yolov8n-320.onnx',
  metadata: 'models/yolov8n/metadata.json',
  wasm: 'ort/ort-wasm-simd-threaded.wasm',
  trace: 'traces/vision.json',
  clip: 'media/desk.mp4',
} as const

export interface Availability {
  /** The published detector, or null when there is none (or its metadata is unusable). */
  detector: DetectorMeta | null
  /** Decoded size of the ORT .wasm as built, when the inventory says; the tap's progress total. */
  runtimeBytes: number | null
  /** A recorded trace is published. */
  trace: boolean
  /** The recorded clip is published. */
  clip: boolean
}

export const NOTHING_PUBLISHED: Availability = Object.freeze({ detector: null, runtimeBytes: null, trace: false, clip: false })

interface BuildAsset {
  path: string
  bytes: number
  present: boolean
}

/** The inventory in `build-info.json` (`assets`), by path; null when the JSON is not a build-info file. */
export function readBuildAssets(info: unknown): Map<string, BuildAsset> | null {
  if (typeof info !== 'object' || info === null) return null
  const assets = (info as { assets?: unknown }).assets
  if (!Array.isArray(assets)) return null
  const map = new Map<string, BuildAsset>()
  for (const entry of assets) {
    if (typeof entry !== 'object' || entry === null) continue
    const { path, bytes, present } = entry as Record<string, unknown>
    if (typeof path === 'string') map.set(path, { path, bytes: typeof bytes === 'number' ? bytes : 0, present: present === true })
  }
  return map
}

/**
 * Validate `metadata.json`. The worker is built for the 320 px export, so any other `inputSize` is
 * refused. A missing `classes` list means the stock COCO names. Returns null for anything unusable.
 */
export function parseMetadata(value: unknown): DetectorMeta | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { inputSize, bytes, sha256, quant, classes } = value as Record<string, unknown>
  if (inputSize !== INPUT_SIZE) return null
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null
  if (typeof quant !== 'string' || quant.length === 0) return null
  if (sha256 !== undefined && typeof sha256 !== 'string') return null
  let names: readonly string[] = COCO_CLASSES
  if (classes !== undefined) {
    if (!Array.isArray(classes) || classes.length < 1 || !classes.every((name) => typeof name === 'string' && name.length > 0)) return null
    names = classes as string[]
  }
  return { inputSize, bytes, quant, classes: names, ...(typeof sha256 === 'string' ? { sha256 } : {}) }
}

export interface AvailabilityDeps {
  /** Fetch a same-origin JSON file (path without a leading slash). Null on any failure. */
  fetchJson(path: string): Promise<unknown>
  /** Dev server only: build-info.json does not exist there, so ask for the files directly. */
  probeDirectly: boolean
  /** Dev server only: does this (non-JSON) file exist? */
  exists?(path: string): Promise<boolean>
  /** Dev server only: the size of a same-origin file in bytes, or null. The production build lists sizes in build-info.json. */
  size?(path: string): Promise<number | null>
}

export async function loadAvailability(deps: AvailabilityDeps): Promise<Availability> {
  const assets = readBuildAssets(await deps.fetchJson('build-info.json'))
  let detectorListed = false
  let trace = false
  let clip = false
  let runtimeBytes: number | null = null
  if (assets) {
    detectorListed = assets.get(ASSET_PATHS.model)?.present === true
    trace = assets.get(ASSET_PATHS.trace)?.present === true
    clip = assets.get(ASSET_PATHS.clip)?.present === true
    const wasm = assets.get(ASSET_PATHS.wasm)
    runtimeBytes = wasm?.present && wasm.bytes > 0 ? wasm.bytes : null
  } else if (deps.probeDirectly) {
    detectorListed = true // the metadata fetch below decides
    trace = (await deps.fetchJson(ASSET_PATHS.trace)) !== null
    clip = (await deps.exists?.(ASSET_PATHS.clip)) === true
    runtimeBytes = (await deps.size?.(ASSET_PATHS.wasm)) ?? null
  }
  const detector = detectorListed ? parseMetadata(await deps.fetchJson(ASSET_PATHS.metadata)) : null
  return { detector, runtimeBytes, trace, clip }
}

/** Fetch a same-origin JSON file; null when it is missing, not JSON, or the network failed. Never throws. */
export async function fetchJson(path: string): Promise<unknown> {
  try {
    const response = await fetch(`/${path}`)
    if (!response.ok) return null
    return (await response.json()) as unknown
  } catch {
    return null
  }
}

/** Does a same-origin file exist and have the expected media type? Dev server only; never throws. */
export async function fileExists(path: string, typePrefix: string): Promise<boolean> {
  try {
    const response = await fetch(`/${path}`, { method: 'HEAD' })
    return response.ok && (response.headers.get('content-type') ?? '').startsWith(typePrefix)
  } catch {
    return false
  }
}

/** The size of a same-origin file from its headers; null when it is missing or the server does not say. Dev server only; never throws. */
export async function fileSize(path: string): Promise<number | null> {
  try {
    const response = await fetch(`/${path}`, { method: 'HEAD' })
    const bytes = Number(response.headers.get('content-length'))
    return response.ok && bytes > 0 ? bytes : null
  } catch {
    return null
  }
}
