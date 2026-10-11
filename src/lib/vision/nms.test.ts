import assert from 'node:assert/strict'
import { test } from 'node:test'
import { IOU_THRESHOLD, MAX_DETECTIONS, iou, nms, type Candidate } from './nms.ts'

const box = (x1: number, y1: number, x2: number, y2: number, score: number, classId = 0): Candidate => ({ x1, y1, x2, y2, score, classId })

test('IoU: identical boxes are 1, disjoint boxes are 0, touching edges are 0', () => {
  assert.equal(iou(box(0, 0, 10, 10, 1), box(0, 0, 10, 10, 1)), 1)
  assert.equal(iou(box(0, 0, 10, 10, 1), box(20, 20, 30, 30, 1)), 0)
  assert.equal(iou(box(0, 0, 10, 10, 1), box(10, 0, 20, 10, 1)), 0)
})

test('IoU: half overlap is one third (50 shared of 150 total)', () => {
  const value = iou(box(0, 0, 10, 10, 1), box(5, 0, 15, 10, 1))
  assert.ok(Math.abs(value - 1 / 3) < 1e-12)
})

test('IoU: a box with no area overlaps nothing', () => {
  assert.equal(iou(box(5, 5, 5, 5, 1), box(0, 0, 10, 10, 1)), 0)
  assert.equal(iou(box(0, 0, 0, 0, 1), box(0, 0, 0, 0, 1)), 0)
})

test('NMS keeps the most confident of several overlapping boxes of the same class', () => {
  const kept = nms([box(0, 0, 100, 100, 0.6), box(2, 2, 102, 102, 0.9), box(4, 0, 104, 100, 0.7)])
  assert.equal(kept.length, 1)
  assert.equal(kept[0].score, 0.9)
})

test('NMS keeps boxes that overlap less than the threshold, and boxes far apart', () => {
  const kept = nms([box(0, 0, 10, 10, 0.9), box(5, 0, 15, 10, 0.8) /* IoU 1/3 */, box(100, 100, 110, 110, 0.7)])
  assert.deepEqual(kept.map((b) => b.score), [0.9, 0.8, 0.7])
})

test('NMS is class-aware: overlapping boxes of different classes both survive', () => {
  const kept = nms([box(0, 0, 100, 100, 0.9, 41 /* cup */), box(1, 1, 101, 101, 0.8, 63 /* laptop */)])
  assert.deepEqual(kept.map((b) => b.classId), [41, 63])
})

test('suppression needs an IoU strictly above the threshold: exactly 0.45 is kept', () => {
  // The second box lies inside the first and covers 45 of its 100 units of area: IoU = 45 / 100 = 0.45.
  const kept = nms([box(0, 0, 10, 10, 0.9), box(0, 0, 10, 4.5, 0.8)], IOU_THRESHOLD)
  assert.equal(kept.length, 2)
  // A hair more overlap is suppressed.
  assert.equal(nms([box(0, 0, 10, 10, 0.9), box(0, 0, 10, 4.6, 0.8)], IOU_THRESHOLD).length, 1)
})

test('the result is ordered by confidence, whatever order the candidates came in', () => {
  const kept = nms([box(0, 0, 5, 5, 0.3), box(50, 50, 55, 55, 0.9), box(100, 100, 105, 105, 0.6)])
  assert.deepEqual(kept.map((b) => b.score), [0.9, 0.6, 0.3])
})

test('ties keep the earlier candidate, so the output is deterministic', () => {
  const a = box(0, 0, 10, 10, 0.5)
  const b = box(1, 1, 11, 11, 0.5)
  assert.equal(nms([a, b])[0], a)
  assert.equal(nms([b, a])[0], b)
})

test('at most MAX_DETECTIONS boxes are returned (the best ones)', () => {
  // 80 well separated boxes with distinct scores.
  const many = Array.from({ length: 80 }, (_, i) => box(i * 20, 0, i * 20 + 10, 10, 1 - i / 100))
  const kept = nms(many)
  assert.equal(kept.length, MAX_DETECTIONS)
  assert.equal(kept[0].score, 1)
  assert.equal(kept[MAX_DETECTIONS - 1].score, 1 - (MAX_DETECTIONS - 1) / 100)
  assert.equal(nms(many, IOU_THRESHOLD, 5).length, 5)
})

test('NMS does not modify its input', () => {
  const input = [box(0, 0, 100, 100, 0.6), box(2, 2, 102, 102, 0.9)]
  const copy = input.map((b) => ({ ...b }))
  nms(input)
  assert.deepEqual(input, copy)
})

test('no candidates, no detections', () => {
  assert.deepEqual(nms([]), [])
})
