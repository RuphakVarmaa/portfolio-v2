/**
 * Building the detector's input tensor (spec 6.7): the letterboxed square, read back as RGBA bytes from a
 * canvas, becomes planar float32 in 0..1: all the red values, then all the green, then all the blue
 * (NCHW without the batch axis; the worker adds `[1, 3, size, size]` when it wraps the buffer).
 *
 * One buffer is reused for every frame, so a steady stream allocates nothing per frame here.
 */

/** Floats needed for a `size` x `size` RGB tensor. */
export const tensorLength = (size: number): number => 3 * size * size

/** Write `rgba` (`size * size * 4` bytes) into `out` as planar R, G, B scaled to 0..1. Alpha is ignored. */
export function rgbaToPlanar(rgba: Uint8ClampedArray | Uint8Array, size: number, out: Float32Array): void {
  const plane = size * size
  if (rgba.length < plane * 4) throw new RangeError(`Expected ${plane * 4} RGBA bytes for ${size} x ${size}, got ${rgba.length}`)
  if (out.length < plane * 3) throw new RangeError(`The tensor buffer must hold ${plane * 3} floats, got ${out.length}`)
  const scale = 1 / 255
  const g = plane
  const b = plane * 2
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    out[i] = rgba[p] * scale
    out[g + i] = rgba[p + 1] * scale
    out[b + i] = rgba[p + 2] * scale
  }
}
