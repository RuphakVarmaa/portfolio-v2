/**
 * The one-bit "paper and ink" look of the Vision stage (spec 2.5): every frame is reduced to two tones
 * with a 4 x 4 Bayer ordered-dither matrix, at most 320 px wide. It is cheap (one pass over about 77,000
 * pixels) and unmistakably designed, and it means the raw camera picture is never what is on screen.
 *
 * Pure functions over byte arrays, no DOM, so they run under `node --test`.
 */

export type Rgb = readonly [number, number, number]

/** The 4 x 4 Bayer matrix, row-major. Each value 0..15 appears once; it is the threshold ladder of the pattern. */
export const BAYER4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** Integer luma (Rec. 601 weights scaled to 256): 0 for black, 255 for white. */
export const luma = (r: number, g: number, b: number) => (77 * r + 150 * g + 29 * b) >> 8

/**
 * Which of a theme's two inks is the dark one. On the paper theme the ink (#1c1b18) is darker than the
 * paper; on the ink theme the roles swap (ink #ece6d8 is the lighter one). The picture is dithered between
 * the darker and the lighter, so a dark object stays dark on screen whichever theme is active.
 */
export function orderTones(ink: Rgb, paper: Rgb): { dark: Rgb; light: Rgb } {
  return luma(...ink) <= luma(...paper) ? { dark: ink, light: paper } : { dark: paper, light: ink }
}

/**
 * Parse a CSS colour token: `#rgb`, `#rrggbb` or `rgb(r, g, b)`. Custom properties come back from
 * `getComputedStyle` as authored text, with whitespace, so the input is trimmed. Returns null when it
 * is neither.
 */
export function parseColor(text: string): Rgb | null {
  const value = text.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value)
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1]
    const n = parseInt(digits, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(value)
  if (rgb) return [Math.min(255, +rgb[1]), Math.min(255, +rgb[2]), Math.min(255, +rgb[3])]
  return null
}

/**
 * Two-tone ordered dither. `src` is RGBA bytes (`width * height * 4`); the result is RGBA where every pixel
 * is exactly `dark` or `light`, fully opaque. A pixel becomes `dark` when its luma is below the Bayer
 * threshold for its position: black is all `dark`, white is all `light`, mid grey is a half-and-half
 * checker. The picture therefore keeps its tones whichever colours are passed: on the paper theme `dark` is
 * the ink and `light` the paper; on the ink theme the roles swap, so a dark object stays dark on screen.
 * Pass `out` (same length) to reuse a buffer; it is returned.
 */
export function ditherBayer4(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  dark: Rgb,
  light: Rgb,
  out: Uint8ClampedArray = new Uint8ClampedArray(width * height * 4),
): Uint8ClampedArray {
  const length = width * height * 4
  if (src.length < length) throw new RangeError(`Expected ${length} bytes for ${width} x ${height} RGBA, got ${src.length}`)
  if (out.length !== length) throw new RangeError(`The output buffer must be ${length} bytes, got ${out.length}`)
  const [dr, dg, db] = dark
  const [lr, lg, lb] = light
  let i = 0
  for (let y = 0; y < height; y++) {
    const row = (y & 3) << 2
    for (let x = 0; x < width; x++, i += 4) {
      const threshold = (BAYER4[row | (x & 3)] << 4) + 8
      if (luma(src[i], src[i + 1], src[i + 2]) < threshold) {
        out[i] = dr
        out[i + 1] = dg
        out[i + 2] = db
      } else {
        out[i] = lr
        out[i + 1] = lg
        out[i + 2] = lb
      }
      out[i + 3] = 255
    }
  }
  return out
}

/**
 * A small one-bit picture of a frame for a card in the queue rack: the luma of each `tw x th` cell is the
 * average of the source pixels it covers (so a thin line does not vanish), then the same 4 x 4 Bayer
 * threshold as the stage turns it into ink and paper. `src` is RGBA bytes (`sw * sh * 4`); the result is
 * RGBA, fully opaque. Pass `out` (`tw * th * 4` bytes) to reuse a buffer.
 */
export function thumbnailBayer(
  src: Uint8ClampedArray | Uint8Array,
  sw: number,
  sh: number,
  tw: number,
  th: number,
  dark: Rgb,
  light: Rgb,
  out: Uint8ClampedArray = new Uint8ClampedArray(tw * th * 4),
): Uint8ClampedArray {
  if (src.length < sw * sh * 4) throw new RangeError(`Expected ${sw * sh * 4} bytes for ${sw} x ${sh} RGBA, got ${src.length}`)
  if (out.length !== tw * th * 4) throw new RangeError(`The output buffer must be ${tw * th * 4} bytes, got ${out.length}`)
  const [dr, dg, db] = dark
  const [lr, lg, lb] = light
  let i = 0
  for (let ty = 0; ty < th; ty++) {
    const y0 = Math.floor((ty * sh) / th)
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * sh) / th))
    const row = (ty & 3) << 2
    for (let tx = 0; tx < tw; tx++, i += 4) {
      const x0 = Math.floor((tx * sw) / tw)
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * sw) / tw))
      let sum = 0
      for (let y = y0; y < y1; y++) {
        let p = (y * sw + x0) * 4
        for (let x = x0; x < x1; x++, p += 4) sum += luma(src[p], src[p + 1], src[p + 2])
      }
      const average = sum / ((x1 - x0) * (y1 - y0))
      if (average < (BAYER4[row | (tx & 3)] << 4) + 8) {
        out[i] = dr
        out[i + 1] = dg
        out[i + 2] = db
      } else {
        out[i] = lr
        out[i + 1] = lg
        out[i + 2] = lb
      }
      out[i + 3] = 255
    }
  }
  return out
}

/**
 * The stage's idle picture and the frame "Show me the pipeline" sends through when there is no camera: a
 * grey-scale tone chart drawn by code (not a photograph, not generated imagery). Top: a smooth ramp from
 * black to white, which shows the dither pattern thickening. Middle: eight flat steps. Bottom: two stripes
 * of 25% and 75% grey. RGBA bytes, opaque.
 */
export function toneChart(width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4)
  const rampEnd = Math.floor(height * 0.58)
  const stepsEnd = Math.floor(height * 0.88)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value: number
      if (y < rampEnd) value = (x / Math.max(1, width - 1)) * 255
      else if (y < stepsEnd) value = (Math.min(7, Math.floor((x / width) * 8)) / 7) * 255
      else value = x < width / 2 ? 64 : 191
      const i = (y * width + x) * 4
      out[i] = out[i + 1] = out[i + 2] = value
      out[i + 3] = 255
    }
  }
  return out
}

/**
 * Fit a source frame inside a `max` x `max` box without changing its aspect ratio, never upscaling: the
 * size the stage captures at. A 640 x 480 camera becomes 320 x 240; a portrait 480 x 640 becomes 240 x 320.
 */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: max, height: Math.round((max * 3) / 4) }
  const scale = Math.min(1, max / width, max / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * Fit a frame inside a `boxW` x `boxH` box without distortion (scaling up or down to fill it on the limiting
 * side): the size of a thumbnail on a rack card, so a portrait frame sits inside a landscape card.
 */
export function fitInBox(width: number, height: number, boxW: number, boxH: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: boxW, height: boxH }
  const scale = Math.min(boxW / width, boxH / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * Shrink a frame to fit `maxWidth` (never enlarging it), keeping its shape: what the stage shows when its
 * room is narrower than the frame. Only the width limits it: a portrait frame is tall, not wide, so it keeps
 * its full size wherever its width fits.
 */
export function fitToWidth(width: number, height: number, maxWidth: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: Math.max(1, Math.round(maxWidth)), height: Math.max(1, Math.round((maxWidth * 3) / 4)) }
  const scale = Math.min(1, maxWidth / width)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
