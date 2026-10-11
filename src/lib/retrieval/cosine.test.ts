import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cosine, decodeFloat32, dot, encodeFloat32, norm, normalize } from './cosine.ts'

test('dot, norm and cosine', () => {
  assert.equal(dot([1, 2, 3], [4, 5, 6]), 32)
  assert.equal(norm([3, 4]), 5)
  assert.equal(cosine([1, 0], [0, 1]), 0)
  assert.ok(Math.abs(cosine([1, 2, 3], [2, 4, 6]) - 1) < 1e-12)
  assert.ok(Math.abs(cosine([1, 2], [-1, -2]) + 1) < 1e-12)
})

test('the zero vector has no direction: cosine 0 and no NaN anywhere', () => {
  assert.equal(cosine([0, 0], [1, 2]), 0)
  assert.deepEqual(Array.from(normalize([0, 0, 0])), [0, 0, 0])
})

test('normalize gives unit length and keeps the direction', () => {
  const unit = normalize([3, 4, 0])
  assert.ok(Math.abs(norm(unit) - 1) < 1e-6)
  assert.ok(Math.abs(unit[0] - 0.6) < 1e-6 && Math.abs(unit[1] - 0.8) < 1e-6)
})

test('float32 base64 round-trips exactly, for any length', () => {
  for (const length of [0, 1, 3, 384, 10_000]) {
    const values = Float32Array.from({ length }, (_, i) => Math.fround(Math.sin(i * 1.7) * 3.3 - i * 1e-3))
    const encoded = encodeFloat32(values)
    assert.match(encoded, /^[A-Za-z0-9+/]*={0,2}$/)
    assert.deepEqual(Array.from(decodeFloat32(encoded)), Array.from(values))
    assert.equal(decodeFloat32(encoded, length).length, length)
  }
})

test('decoding rejects the wrong number of values', () => {
  const encoded = encodeFloat32(Float32Array.from([1, 2, 3]))
  assert.throws(() => decodeFloat32(encoded, 4), /expected 4/)
  assert.throws(() => decodeFloat32(btoa('abc')), /whole number of float32/)
})

test('encode ignores the offset of a view into a larger buffer', () => {
  const buffer = new Float32Array([9, 1, 2, 3, 9])
  assert.deepEqual(Array.from(decodeFloat32(encodeFloat32(buffer.subarray(1, 4)))), [1, 2, 3])
})
