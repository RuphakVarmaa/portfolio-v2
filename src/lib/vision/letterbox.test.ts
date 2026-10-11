import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INPUT_SIZE, letterbox, unletterbox } from './letterbox.ts'

test('a 4:3 landscape frame fills the width and is padded above and below', () => {
  const lb = letterbox(320, 240)
  assert.deepEqual({ w: lb.width, h: lb.height, x: lb.padX, y: lb.padY }, { w: 320, h: 240, x: 0, y: 40 })
  assert.equal(lb.scaleX, 1)
  assert.equal(lb.scaleY, 1)
})

test('a portrait frame fills the height and is padded left and right', () => {
  const lb = letterbox(240, 320)
  assert.deepEqual({ w: lb.width, h: lb.height, x: lb.padX, y: lb.padY }, { w: 240, h: 320, x: 40, y: 0 })
})

test('a larger frame is scaled down and a smaller one is scaled up, both without changing the aspect ratio', () => {
  const down = letterbox(1280, 720)
  assert.equal(down.width, INPUT_SIZE)
  assert.equal(down.height, 180)
  assert.equal(down.padY, 70)
  assert.ok(Math.abs(down.scaleX - down.scaleY) < 0.01)

  const up = letterbox(160, 120)
  assert.equal(up.width, INPUT_SIZE)
  assert.equal(up.height, 240)
  assert.equal(up.scaleX, 2)
})

test('a square frame has no padding', () => {
  const lb = letterbox(640, 640)
  assert.deepEqual({ w: lb.width, h: lb.height, x: lb.padX, y: lb.padY }, { w: 320, h: 320, x: 0, y: 0 })
})

test('an extreme aspect ratio still yields a content size of at least one pixel and stays inside the square', () => {
  const lb = letterbox(5000, 4)
  assert.equal(lb.width, INPUT_SIZE)
  assert.ok(lb.height >= 1 && lb.height <= INPUT_SIZE)
  assert.ok(lb.padY >= 0 && lb.padY + lb.height <= INPUT_SIZE)
})

test('an empty frame is refused', () => {
  assert.throws(() => letterbox(0, 240), RangeError)
  assert.throws(() => letterbox(320, -1), RangeError)
  assert.throws(() => letterbox(Number.NaN, 10), RangeError)
})

test('unletterbox is the inverse of the drawing: a box drawn into the square maps back to where it started', () => {
  for (const [w, h] of [
    [320, 240],
    [240, 320],
    [1280, 720],
    [160, 120],
    [333, 211],
  ] as const) {
    const lb = letterbox(w, h)
    // A box that covers the middle third of the source frame, as drawn into the square.
    const src = { x: w / 3, y: h / 3, w: w / 3, h: h / 3 }
    const x1 = lb.padX + src.x * lb.scaleX
    const y1 = lb.padY + src.y * lb.scaleY
    const x2 = lb.padX + (src.x + src.w) * lb.scaleX
    const y2 = lb.padY + (src.y + src.h) * lb.scaleY
    const back = unletterbox(x1, y1, x2, y2, lb, w, h)
    assert.ok(Math.abs(back.x - src.x) < 1e-9, `${w}x${h} x`)
    assert.ok(Math.abs(back.y - src.y) < 1e-9, `${w}x${h} y`)
    assert.ok(Math.abs(back.w - src.w) < 1e-9, `${w}x${h} w`)
    assert.ok(Math.abs(back.h - src.h) < 1e-9, `${w}x${h} h`)
  }
})

test('unletterbox clips to the frame and collapses boxes that lie in the padding', () => {
  const lb = letterbox(320, 240) // padY 40
  // Sticks out above and to the left of the picture.
  const clipped = unletterbox(-20, 10, 100, 100, lb, 320, 240)
  assert.equal(clipped.x, 0)
  assert.equal(clipped.y, 0)
  assert.equal(clipped.w, 100)
  assert.equal(clipped.h, 60)
  // Entirely inside the top padding band.
  const inPadding = unletterbox(50, 0, 150, 30, lb, 320, 240)
  assert.equal(inPadding.h, 0)
  // Sticks out past the right and bottom edges.
  const far = unletterbox(300, 250, 400, 400, lb, 320, 240)
  assert.equal(far.x + far.w, 320)
  assert.equal(far.y + far.h, 240)
})
