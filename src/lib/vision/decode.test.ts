import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COCO_CLASSES } from './coco-classes.ts'
import { CONF_THRESHOLD, MAX_CANDIDATES, decodeYolo, detectionsFromOutput } from './decode.ts'
import { letterbox } from './letterbox.ts'

/**
 * A tiny head: 2 classes, 4 anchors. Channel order is [cx, cy, w, h, class0, class1].
 *   anchor 0: a 100 x 60 box centred at (160, 120), class 0 at 0.90
 *   anchor 1: nearly the same box, class 0 at 0.80 (NMS must drop it)
 *   anchor 2: a 20 x 20 box centred at (50, 80), class 1 at 0.60
 *   anchor 3: below the confidence threshold
 */
const ANCHORS = [
  { cx: 160, cy: 120, w: 100, h: 60, scores: [0.9, 0.1] },
  { cx: 163, cy: 121, w: 100, h: 60, scores: [0.8, 0.2] },
  { cx: 50, cy: 80, w: 20, h: 20, scores: [0.1, 0.6] },
  { cx: 300, cy: 300, w: 10, h: 10, scores: [0.1, 0.2] },
]

function channelsFirst(): Float32Array {
  const channels = 6
  const out = new Float32Array(channels * ANCHORS.length)
  ANCHORS.forEach((anchor, a) => {
    const row = [anchor.cx, anchor.cy, anchor.w, anchor.h, ...anchor.scores]
    row.forEach((value, c) => {
      out[c * ANCHORS.length + a] = value
    })
  })
  return out
}

function anchorsFirst(): Float32Array {
  const out = new Float32Array(6 * ANCHORS.length)
  ANCHORS.forEach((anchor, a) => {
    ;[anchor.cx, anchor.cy, anchor.w, anchor.h, ...anchor.scores].forEach((value, c) => {
      out[a * 6 + c] = value
    })
  })
  return out
}

const near = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) <= eps

test('decode reads centre-form boxes and the best class score of each anchor above the threshold', () => {
  const found = decodeYolo(channelsFirst(), [1, 6, 4], CONF_THRESHOLD, 'channels-first')
  assert.equal(found.length, 3, 'the fourth anchor is below the 0.25 confidence threshold')
  assert.equal(found[0].classId, 0)
  assert.ok(near(found[0].score, 0.9))
  assert.ok(near(found[0].x1, 110) && near(found[0].y1, 90) && near(found[0].x2, 210) && near(found[0].y2, 150))
  assert.equal(found[2].classId, 1, 'the best of the two class scores wins')
  assert.ok(near(found[2].x1, 40) && near(found[2].y2, 90))
})

test('the transposed layout [1, N, 84] decodes to the same candidates', () => {
  assert.deepEqual(
    decodeYolo(anchorsFirst(), [1, 4, 6], CONF_THRESHOLD, 'anchors-first'),
    decodeYolo(channelsFirst(), [1, 6, 4], CONF_THRESHOLD, 'channels-first'),
  )
})

test('the threshold is strict: a score exactly at the threshold is discarded, and NaN never passes', () => {
  const data = new Float32Array([100, 100, 10, 10, CONF_THRESHOLD])
  assert.equal(decodeYolo(data, [1, 5, 1], CONF_THRESHOLD, 'channels-first').length, 0)
  assert.equal(decodeYolo(new Float32Array([100, 100, 10, 10, Number.NaN]), [1, 5, 1], CONF_THRESHOLD, 'channels-first').length, 0)
  assert.equal(decodeYolo(new Float32Array([100, 100, 10, 10, 0.2501]), [1, 5, 1], CONF_THRESHOLD, 'channels-first').length, 1)
})

test('the real 320 px YOLOv8 shape [1, 84, 2100] decodes (an all-zero head has nothing in it)', () => {
  assert.deepEqual(decodeYolo(new Float32Array(84 * 2100), [1, 84, 2100]), [])
  assert.deepEqual(decodeYolo(new Float32Array(84 * 2100), [1, 2100, 84]), [])
})

test('only the best MAX_CANDIDATES survive on a very busy scene', () => {
  const anchors = MAX_CANDIDATES + 40
  const data = new Float32Array(5 * anchors)
  for (let a = 0; a < anchors; a++) {
    data[a] = 100 // cx
    data[anchors + a] = 100 // cy
    data[2 * anchors + a] = 10 // w
    data[3 * anchors + a] = 10 // h
    data[4 * anchors + a] = 0.3 + a / 10_000 // score, rising with a
  }
  const found = decodeYolo(data, [1, 5, anchors], CONF_THRESHOLD, 'channels-first')
  assert.equal(found.length, MAX_CANDIDATES)
  // Scores are stored as float32, so compare with a tolerance of a few millionths.
  assert.ok(found.every((c) => c.score >= 0.3 + 40 / 10_000 - 1e-6), 'the 40 weakest were dropped')
})

test('a malformed output is refused with a message that says what was wrong', () => {
  assert.throws(() => decodeYolo(new Float32Array(10), [2, 5, 1]), /Unexpected detector output shape/)
  assert.throws(() => decodeYolo(new Float32Array(10), [1, 5]), /Unexpected detector output shape/)
  assert.throws(() => decodeYolo(new Float32Array(4), [1, 4, 1], CONF_THRESHOLD, 'channels-first'), /at least one class/)
  assert.throws(() => decodeYolo(new Float32Array(3), [1, 6, 4], CONF_THRESHOLD, 'channels-first'), /needs 24/)
})

test('detections come back in the frame\'s own pixels: NMS applied, letterbox undone, classes named', () => {
  // A 320 x 240 frame sits in the square with 40 px of padding above and below (scale 1).
  const lb = letterbox(320, 240)
  const names = ['person', 'cup']
  const boxes = detectionsFromOutput(channelsFirst(), [1, 6, 4], lb, 320, 240, names, { layout: 'channels-first' })
  assert.equal(boxes.length, 2, 'the near-duplicate of the first box was suppressed')
  assert.deepEqual(boxes[0], { x: 110, y: 50, w: 100, h: 60, cls: 'person', conf: 0.9 })
  assert.deepEqual(boxes[1], { x: 40, y: 30, w: 20, h: 20, cls: 'cup', conf: 0.6 })
})

test('a class id with no name is still reported, and boxes lost in the padding are dropped', () => {
  const lb = letterbox(320, 240)
  // One box wholly inside the top padding band (y < 40) and one real box with an unnamed class.
  const data = new Float32Array([
    // anchor 0: centred at y = 20 (padding), anchor 1: centred at y = 120
    100, 100,
    20, 120,
    30, 30,
    10, 40,
    0.9, 0.1,
    0.1, 0.8,
  ])
  const boxes = detectionsFromOutput(data, [1, 6, 2], lb, 320, 240, ['person'], { layout: 'channels-first' })
  assert.equal(boxes.length, 1)
  assert.equal(boxes[0].cls, 'class 1')
})

test('the COCO list has the 80 names in YOLO order', () => {
  assert.equal(COCO_CLASSES.length, 80)
  assert.equal(new Set(COCO_CLASSES).size, 80, 'no duplicates')
  assert.equal(COCO_CLASSES[0], 'person')
  assert.equal(COCO_CLASSES[41], 'cup')
  assert.equal(COCO_CLASSES[63], 'laptop')
  assert.equal(COCO_CLASSES[79], 'toothbrush')
})
