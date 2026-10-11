import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WOBBLE_MAX, createRng, fmt, hashString, penLine, smoothPath, subdivide, wobblePoints, type Pt } from './wobble.ts'

test('the PRNG is deterministic per seed and spreads over [0, 1)', () => {
  const a = createRng('board:retrieval')
  const b = createRng('board:retrieval')
  const first = Array.from({ length: 8 }, () => a())
  assert.deepEqual(first, Array.from({ length: 8 }, () => b()))
  assert.ok(first.every((v) => v >= 0 && v < 1))
  assert.notDeepEqual(first, Array.from({ length: 8 }, createRng('board:vision')))
  // Pinned values: if these change, every wobbled drawing changes (and hydration would differ from old builds).
  assert.equal(hashString('quorum'), 1354355728)
  assert.deepEqual(Array.from({ length: 3 }, createRng(42)).map((v) => Math.round(v * 1e6) / 1e6), [0.601104, 0.448291, 0.852466])
})

test('wobble never displaces a point by more than the spec bound, even when asked for more', () => {
  const points: Pt[] = Array.from({ length: 400 }, (_, i) => [i * 3, i * 2] as const)
  for (const amp of [0.3, 0.9, 1.2, 5]) {
    const moved = wobblePoints(points, 'seed', amp)
    const worst = Math.max(...moved.map(([x, y], i) => Math.hypot(x - points[i][0], y - points[i][1])))
    assert.ok(worst <= Math.min(amp, WOBBLE_MAX) + 1e-9, `amp ${amp}: worst ${worst}`)
  }
  assert.deepEqual(wobblePoints(points, 'seed', 0), points)
})

test('penLine is identical across calls (server == client) and different per seed', () => {
  const line: Pt[] = [[0, 0], [100, 0], [100, 60]]
  assert.equal(penLine(line, 'a'), penLine(line, 'a'))
  assert.notEqual(penLine(line, 'a'), penLine(line, 'b'))
  assert.match(penLine(line, 'a'), /^M[-\d.]+ [-\d.]+(C[-\d. ]+)+$/)
  assert.ok(!penLine(line, 'a').includes('NaN'))
  assert.match(penLine(line, 'a', { closed: true }), /Z$/)
})

test('subdivide keeps the endpoints and bounds segment length', () => {
  const out = subdivide([[0, 0], [100, 0]], 22)
  assert.deepEqual(out[0], [0, 0])
  assert.deepEqual(out.at(-1), [100, 0])
  for (let i = 1; i < out.length; i++) assert.ok(out[i][0] - out[i - 1][0] <= 22 + 1e-9)
})

test('smoothPath handles degenerate input and fmt never prints -0', () => {
  assert.equal(smoothPath([]), '')
  assert.equal(smoothPath([[1, 2]]), 'M1 2')
  assert.equal(smoothPath([[1, 2], [3, 4]]), 'M1 2L3 4')
  assert.equal(fmt(-0.001), '0')
  assert.equal(fmt(1.2345), '1.23')
  assert.equal(fmt(3), '3')
})
