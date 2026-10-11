/**
 * Non-maximum suppression for the detector (spec 6.7: IoU 0.45, at most 50 detections).
 *
 * A YOLO head proposes many overlapping boxes for one object. NMS keeps the most confident one and drops
 * the others that overlap it too much. It is class-aware, like Ultralytics' default: a cup sitting in front
 * of a laptop must not suppress the laptop just because their boxes overlap.
 */

/** IoU above which two boxes of the same class count as the same object. */
export const IOU_THRESHOLD = 0.45

/** Most detections returned per frame. */
export const MAX_DETECTIONS = 50

/** A box in corner form with its best class and score. Coordinates are in whatever space the caller works in. */
export interface Candidate {
  x1: number
  y1: number
  x2: number
  y2: number
  score: number
  classId: number
}

/** Intersection over union of two corner-form boxes. 0 when they do not overlap or either has no area. */
export function iou(a: Pick<Candidate, 'x1' | 'y1' | 'x2' | 'y2'>, b: Pick<Candidate, 'x1' | 'y1' | 'x2' | 'y2'>): number {
  const width = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)
  const height = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)
  if (width <= 0 || height <= 0) return 0
  const inter = width * height
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter
  return union <= 0 ? 0 : inter / union
}

/**
 * Greedy NMS: walk the candidates from most to least confident and keep each one unless a box of the SAME
 * class that was already kept overlaps it by more than `iouThreshold` (strictly more, as torchvision does).
 * Ties in score keep the earlier candidate, so the result is deterministic. The input is not modified.
 */
export function nms(
  candidates: readonly Candidate[],
  iouThreshold: number = IOU_THRESHOLD,
  maxDetections: number = MAX_DETECTIONS,
): Candidate[] {
  const order = candidates.map((_, index) => index).sort((i, j) => candidates[j].score - candidates[i].score || i - j)
  const kept: Candidate[] = []
  for (const index of order) {
    if (kept.length >= maxDetections) break
    const box = candidates[index]
    let suppressed = false
    for (const winner of kept) {
      if (winner.classId === box.classId && iou(winner, box) > iouThreshold) {
        suppressed = true
        break
      }
    }
    if (!suppressed) kept.push(box)
  }
  return kept
}
