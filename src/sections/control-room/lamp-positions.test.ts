import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BOARD_SIZE,
  LAMP_ORDER,
  LAMP_POSITIONS,
  LAMP_POSITIONS_NARROW,
  LAMP_TILT,
  SERVICE_LAMPS,
  TOP_ROW,
  positionsFor,
  toUnits,
} from './lamp-positions.ts'

test('the landscape positions are exactly the spec (4.1): percent of the board box, centre of each part', () => {
  assert.deepEqual(LAMP_POSITIONS, {
    controlPlane: { x: 50, y: 50 },
    retrieval: { x: 18, y: 28 },
    vision: { x: 82, y: 28 },
    policy: { x: 18, y: 76 },
    review: { x: 82, y: 76 },
    sensors: { x: 50, y: 90 },
  })
  assert.deepEqual(BOARD_SIZE.wide, { width: 1200, height: 720 })
})

test('both layouts are mirror symmetric about the vertical axis, and the relay sits in the middle', () => {
  for (const layout of [LAMP_POSITIONS, LAMP_POSITIONS_NARROW]) {
    assert.equal(layout.vision.x, 100 - layout.retrieval.x)
    assert.equal(layout.review.x, 100 - layout.policy.x)
    assert.equal(layout.vision.y, layout.retrieval.y)
    assert.equal(layout.review.y, layout.policy.y)
    assert.deepEqual(layout.controlPlane, { x: 50, y: 50 })
    assert.equal(layout.sensors.x, 50)
  }
})

test('every part is inside the board, in both layouts', () => {
  for (const layout of [LAMP_POSITIONS, LAMP_POSITIONS_NARROW]) {
    for (const [name, at] of Object.entries(layout)) {
      assert.ok(at.x > 0 && at.x < 100 && at.y > 0 && at.y < 100, `${name} is off the board`)
    }
  }
})

test('the portrait layout puts the top lamps above and the bottom lamps below the relay, and keeps SENSORS between the top two', () => {
  const n = LAMP_POSITIONS_NARROW
  assert.ok(n.retrieval.y < n.controlPlane.y && n.policy.y > n.controlPlane.y)
  assert.ok(n.sensors.x > n.retrieval.x && n.sensors.x < n.vision.x)
  assert.equal(n.sensors.y, n.retrieval.y)
})

test('lamp order is reading order, SENSORS last; the services are the first four; the top row is retrieval and vision', () => {
  assert.deepEqual([...LAMP_ORDER], ['retrieval', 'vision', 'policy', 'review', 'sensors'])
  assert.deepEqual([...SERVICE_LAMPS], LAMP_ORDER.slice(0, 4))
  assert.deepEqual([...TOP_ROW], ['retrieval', 'vision'])
})

test('lamps are hand-mounted a degree or two off true, never more', () => {
  for (const [id, degrees] of Object.entries(LAMP_TILT)) {
    assert.ok(Math.abs(degrees) <= 3 && degrees !== 0, `${id}: ${degrees}`)
  }
  assert.equal(new Set(Object.values(LAMP_TILT)).size, LAMP_ORDER.length, 'five different angles')
})

test('toUnits converts percent to the drawing space of each layout', () => {
  const wide = toUnits('wide', LAMP_POSITIONS.retrieval)
  assert.equal(wide.x, 216)
  assert.ok(Math.abs(wide.y - 201.6) < 1e-9)
  assert.deepEqual(toUnits('narrow', LAMP_POSITIONS_NARROW.controlPlane), { x: 200, y: 390 })
  assert.equal(positionsFor('wide'), LAMP_POSITIONS)
  assert.equal(positionsFor('narrow'), LAMP_POSITIONS_NARROW)
})
