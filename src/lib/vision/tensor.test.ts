import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rgbaToPlanar, tensorLength } from './tensor.ts'

test('RGBA bytes become planar R, G, B floats in 0..1', () => {
  // A 2 x 2 image: red, green, blue, white (alpha is 7, 8, 9, 10: it must be ignored).
  const rgba = new Uint8ClampedArray([255, 0, 0, 7, 0, 255, 0, 8, 0, 0, 255, 9, 255, 255, 255, 10])
  const out = new Float32Array(tensorLength(2))
  rgbaToPlanar(rgba, 2, out)
  assert.deepEqual([...out.slice(0, 4)], [1, 0, 0, 1], 'red plane')
  assert.deepEqual([...out.slice(4, 8)], [0, 1, 0, 1], 'green plane')
  assert.deepEqual([...out.slice(8, 12)], [0, 0, 1, 1], 'blue plane')
})

test('mid values scale by 1/255', () => {
  const out = new Float32Array(3)
  rgbaToPlanar(new Uint8ClampedArray([51, 102, 153, 255]), 1, out)
  assert.ok(Math.abs(out[0] - 0.2) < 1e-6)
  assert.ok(Math.abs(out[1] - 0.4) < 1e-6)
  assert.ok(Math.abs(out[2] - 0.6) < 1e-6)
})

test('a buffer that is too small is refused, a larger one is fine', () => {
  assert.throws(() => rgbaToPlanar(new Uint8ClampedArray(8), 2, new Float32Array(12)), RangeError)
  assert.throws(() => rgbaToPlanar(new Uint8ClampedArray(16), 2, new Float32Array(11)), RangeError)
  rgbaToPlanar(new Uint8ClampedArray(16), 2, new Float32Array(20))
  assert.equal(tensorLength(320), 307_200)
})
