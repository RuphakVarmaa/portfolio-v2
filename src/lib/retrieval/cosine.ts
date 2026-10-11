/**
 * Vector helpers for the embedding path: dot product, normalisation, cosine, and the base64 float32
 * encoding `embeddings.json` uses (spec 6.6: "Float32 base64 per chunk id").
 *
 * Pure and DOM-free (no Node-only API either: `btoa`/`atob` exist in browsers, workers and Node).
 */

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length)
  let sum = 0
  for (let i = 0; i < n; i++) sum += a[i] * b[i]
  return sum
}

export function norm(a: ArrayLike<number>): number {
  return Math.sqrt(dot(a, a))
}

/** A unit-length copy. The zero vector stays zero (no NaN). */
export function normalize(a: ArrayLike<number>): Float32Array {
  const out = new Float32Array(a.length)
  const length = norm(a)
  if (length === 0) return out
  for (let i = 0; i < a.length; i++) out[i] = a[i] / length
  return out
}

/** Cosine similarity in [-1, 1]; 0 when either vector is the zero vector. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const denominator = norm(a) * norm(b)
  return denominator === 0 ? 0 : dot(a, b) / denominator
}

/** Float32 values, little endian, as base64. */
export function encodeFloat32(values: Float32Array): string {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength)
  let binary = ''
  const step = 0x2000
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step))
  return btoa(binary)
}

/** Inverse of `encodeFloat32`. Throws when the length is not a whole number of floats (or is not `dim` floats, when given). */
export function decodeFloat32(base64: string, dim?: number): Float32Array {
  const binary = atob(base64)
  if (binary.length % 4 !== 0) throw new Error('embedding is not a whole number of float32 values')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const values = new Float32Array(bytes.buffer)
  if (dim !== undefined && values.length !== dim) throw new Error(`embedding has ${values.length} values, expected ${dim}`)
  return values
}
