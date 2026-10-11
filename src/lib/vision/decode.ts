import type { Box } from '../../cluster/protocol.ts'
import { unletterbox, type Letterbox } from './letterbox.ts'
import { IOU_THRESHOLD, MAX_DETECTIONS, nms, type Candidate } from './nms.ts'

/**
 * Decoding a YOLOv8 head (spec 6.7). For the 320 px export the output tensor is `[1, 84, 2100]`: 2100
 * anchors (40x40 + 20x20 + 10x10 cells), each with 4 box numbers (centre x, centre y, width, height, in
 * input pixels) followed by 80 class scores. Some exporters transpose it to `[1, 2100, 84]`; both are read.
 *
 * There is no separate "objectness" channel in v8: the best class score is the confidence.
 */

/** Detections below this confidence are discarded (spec 6.7). */
export const CONF_THRESHOLD = 0.25

/** Boxes kept for NMS, best first. Bounds the O(n^2) suppression pass on a busy scene. */
export const MAX_CANDIDATES = 300

/**
 * Which axis of `[1, A, B]` holds the 4 + classes channels. `auto` takes the shorter axis, which is right
 * for every real head (84 channels against thousands of anchors); tiny hand-made tensors pass it explicitly.
 */
export type Layout = 'auto' | 'channels-first' | 'anchors-first'

/**
 * Turn the raw head output into candidate boxes in the model's input pixels. `dims` is the tensor shape.
 * Anything whose best class score is not strictly above `confThreshold` is dropped (NaN included).
 */
export function decodeYolo(
  data: ArrayLike<number>,
  dims: readonly number[],
  confThreshold: number = CONF_THRESHOLD,
  layout: Layout = 'auto',
): Candidate[] {
  if (dims.length !== 3 || dims[0] !== 1) throw new Error(`Unexpected detector output shape [${dims.join(', ')}]; expected [1, 84, N] or [1, N, 84]`)
  const channelsFirst = layout === 'auto' ? dims[1] <= dims[2] : layout === 'channels-first'
  const channels = channelsFirst ? dims[1] : dims[2]
  const anchors = channelsFirst ? dims[2] : dims[1]
  const classes = channels - 4
  if (classes < 1) throw new Error(`The detector output has ${channels} channels; a YOLO head has 4 box numbers plus at least one class`)
  if (data.length < channels * anchors) throw new Error(`The detector output has ${data.length} numbers; shape [${dims.join(', ')}] needs ${channels * anchors}`)

  // Element (channel c, anchor a) lives at `a * strideA + c * strideC`.
  const strideC = channelsFirst ? anchors : 1
  const strideA = channelsFirst ? 1 : channels

  const found: Candidate[] = []
  for (let a = 0; a < anchors; a++) {
    const base = a * strideA
    let classId = 0
    let score = data[base + 4 * strideC]
    for (let c = 1; c < classes; c++) {
      const value = data[base + (4 + c) * strideC]
      if (value > score) {
        score = value
        classId = c
      }
    }
    if (!(score > confThreshold)) continue
    const cx = data[base]
    const cy = data[base + strideC]
    const w = data[base + 2 * strideC]
    const h = data[base + 3 * strideC]
    found.push({ x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2, score, classId })
  }
  if (found.length > MAX_CANDIDATES) {
    found.sort((p, q) => q.score - p.score)
    found.length = MAX_CANDIDATES
  }
  return found
}

export interface DetectOptions {
  confThreshold?: number
  iouThreshold?: number
  maxDetections?: number
  layout?: Layout
}

const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * The whole post-processing step: decode, suppress overlaps, then undo the letterbox so every box is in
 * the source frame's own pixels. Boxes that fall entirely in the padding are dropped. `names[classId]`
 * names the class (an id with no name becomes `class <id>`).
 */
export function detectionsFromOutput(
  data: ArrayLike<number>,
  dims: readonly number[],
  box: Letterbox,
  srcWidth: number,
  srcHeight: number,
  names: readonly string[],
  options: DetectOptions = {},
): Box[] {
  const { confThreshold = CONF_THRESHOLD, iouThreshold = IOU_THRESHOLD, maxDetections = MAX_DETECTIONS, layout = 'auto' } = options
  const kept = nms(decodeYolo(data, dims, confThreshold, layout), iouThreshold, maxDetections)
  const boxes: Box[] = []
  for (const candidate of kept) {
    const rect = unletterbox(candidate.x1, candidate.y1, candidate.x2, candidate.y2, box, srcWidth, srcHeight)
    if (rect.w < 1 || rect.h < 1) continue
    boxes.push({
      x: round1(rect.x),
      y: round1(rect.y),
      w: round1(rect.w),
      h: round1(rect.h),
      cls: names[candidate.classId] ?? `class ${candidate.classId}`,
      conf: Math.round(candidate.score * 1000) / 1000,
    })
  }
  return boxes
}
