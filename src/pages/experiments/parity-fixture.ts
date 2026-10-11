import { decodeFloat32, norm } from '../../lib/retrieval/cosine.ts'
import { EMBED_DIM, PARITY_SENTENCES, buildParityFixture, type ParityFixture } from '../../lib/retrieval/embed.ts'

/**
 * The parity fixture (spec 6.6): the five fixed sentences of `src/lib/retrieval/embed.ts` as THIS browser's
 * encoder embedded them, saved so `scripts/parity.test.mjs` can embed the same five with the same package in
 * Node and hold the two to cosine >= 0.999.
 *
 * Nothing is typed in or simulated. The retrieval worker reports the five vectors in the result of
 * `retrieval.loadModel` (`LoadModelResult.parity`, base64 float32 each); this file checks them and writes the
 * file in the exact shape the test reads (`buildParityFixture` from embed.ts). It refuses anything that is not
 * five unit-length vectors of the encoder's dimension, so a half-broken run cannot produce a fixture that
 * would later pass or fail for the wrong reason. Pure, so it is tested without a model.
 */

export type FixtureResult = { ok: true; fixture: ParityFixture } | { ok: false; reason: string }

/** A unit vector is within this of length 1 (float32 rounding, plus the quantized encoder's own error). */
const UNIT_TOLERANCE = 1e-3

/** Check what the worker reported and turn it into the fixture. `createdAt` is an ISO date from the caller's clock. */
export function fixtureFromParity(parity: readonly string[] | undefined, createdAt: string): FixtureResult {
  const wanted = PARITY_SENTENCES.length
  if (!parity || parity.length !== wanted) {
    return { ok: false, reason: `The worker reported ${parity ? parity.length : 'no'} parity vectors; ${wanted} were expected.` }
  }
  const vectors: Float32Array[] = []
  for (const [index, encoded] of parity.entries()) {
    let vector: Float32Array
    try {
      vector = decodeFloat32(encoded, EMBED_DIM)
    } catch (error) {
      return { ok: false, reason: `Vector ${index + 1} is not ${EMBED_DIM} numbers: ${error instanceof Error ? error.message : 'it could not be decoded'}.` }
    }
    if (!vector.every(Number.isFinite)) return { ok: false, reason: `Vector ${index + 1} contains a value that is not a number.` }
    if (Math.abs(norm(vector) - 1) > UNIT_TOLERANCE) {
      return { ok: false, reason: `Vector ${index + 1} is not unit length (its length is ${norm(vector).toFixed(4)}).` }
    }
    vectors.push(vector)
  }
  return { ok: true, fixture: buildParityFixture(vectors, createdAt) }
}

/** The file's text: two-space JSON, keys sorted (like the empty template), one trailing newline. */
export function serializeFixture(fixture: ParityFixture): string {
  return JSON.stringify(fixture, Object.keys(fixture).sort(), 2) + '\n'
}

/** The same file with each vector cut short, for the preview on the page (a vector is about 2 KB of base64). */
export function previewFixture(fixture: ParityFixture, keep = 28): string {
  const shown = { ...fixture, vectors: fixture.vectors === null ? null : fixture.vectors.map((vector) => `${vector.slice(0, keep)}…`) }
  return serializeFixture(shown)
}

/** Where the encoder is published, as `build-info.json` lists it (the same list the Colophon and the Vision panel read). */
export const MODEL_ASSET_PATH = 'models/minilm/model_quantized.onnx'

/**
 * Is the encoder published, according to the build's own inventory (`/build-info.json`, `assets`)? `null` when the
 * JSON is not a build-info file (the dev server has none), and then the caller may ask for the file itself. The
 * production site reads this instead of asking for a file that may not be there: the browser prints a red 404 in
 * the console for every probe of a missing file.
 */
export function modelListed(info: unknown): boolean | null {
  if (typeof info !== 'object' || info === null) return null
  const assets = (info as { assets?: unknown }).assets
  if (!Array.isArray(assets)) return null
  const entry = assets.find((asset) => typeof asset === 'object' && asset !== null && (asset as { path?: unknown }).path === MODEL_ASSET_PATH)
  return entry !== undefined && (entry as { present?: unknown }).present === true
}

/** Does the response for the model look like a real model file, not the dev server's HTML fallback for a missing path? */
export function looksLikeModel(response: { ok: boolean; headers: { get(name: string): string | null } }): boolean {
  if (!response.ok) return false
  const type = response.headers.get('content-type') ?? ''
  if (/text\/html/i.test(type)) return false
  const length = Number(response.headers.get('content-length') ?? '')
  return !(Number.isFinite(length) && length > 0 && length < 100_000)
}

export { PARITY_SENTENCES }
