/**
 * Letterboxing for the detector (spec 6.7): fit a frame of any aspect ratio into the model's square
 * 320 x 320 input without distorting it, padding the leftover with grey, and map detections back into the
 * frame's own coordinates afterwards.
 *
 * Pure numbers only (no canvas), so the worker, the tests and any future caller share one definition of
 * where the picture sits inside the square.
 */

/** The detector's input edge, in pixels (the export is `imgsz=320`). */
export const INPUT_SIZE = 320

/** The grey Ultralytics pads with (114 / 255). The spec calls it paper-grey. */
export const PAD_GREY = 114

export interface Letterbox {
  /** Edge of the square input. */
  size: number
  /** Content size inside the square, in pixels. */
  width: number
  height: number
  /** Offset of the content's top-left corner inside the square. */
  padX: number
  padY: number
  /** Horizontal and vertical scale actually applied (rounding the content size makes them differ slightly). */
  scaleX: number
  scaleY: number
}

export function letterbox(srcWidth: number, srcHeight: number, size: number = INPUT_SIZE): Letterbox {
  if (!(srcWidth > 0) || !(srcHeight > 0)) {
    throw new RangeError(`Cannot letterbox an empty frame (${srcWidth} x ${srcHeight})`)
  }
  const fit = Math.min(size / srcWidth, size / srcHeight)
  const width = Math.max(1, Math.min(size, Math.round(srcWidth * fit)))
  const height = Math.max(1, Math.min(size, Math.round(srcHeight * fit)))
  return {
    size,
    width,
    height,
    padX: Math.floor((size - width) / 2),
    padY: Math.floor((size - height) / 2),
    scaleX: width / srcWidth,
    scaleY: height / srcHeight,
  }
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/**
 * Map a corner-form box (x1, y1, x2, y2 in the square model input) back into the source frame, clipped to
 * the frame. Anything that lay entirely in the padding comes back with zero width or height.
 */
export function unletterbox(x1: number, y1: number, x2: number, y2: number, box: Letterbox, srcWidth: number, srcHeight: number): Rect {
  const left = clamp((x1 - box.padX) / box.scaleX, 0, srcWidth)
  const top = clamp((y1 - box.padY) / box.scaleY, 0, srcHeight)
  const right = clamp((x2 - box.padX) / box.scaleX, 0, srcWidth)
  const bottom = clamp((y2 - box.padY) / box.scaleY, 0, srcHeight)
  return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) }
}
