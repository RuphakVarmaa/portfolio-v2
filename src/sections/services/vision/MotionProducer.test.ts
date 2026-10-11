import assert from 'node:assert/strict'
import { test } from 'node:test'
import { magnitude, needsMotionPermission, readSample, requestMotionPermission } from './MotionProducer.ts'

test('a real event becomes a sample with its timestamp', () => {
  assert.deepEqual(readSample({ accelerationIncludingGravity: { x: 0.1, y: 9.8, z: -0.3 } }, 1234), { ax: 0.1, ay: 9.8, az: -0.3, ts: 1234 })
})

test('an event with no numbers is not a sample (a desktop browser fires an empty one)', () => {
  assert.equal(readSample({}, 0), null)
  assert.equal(readSample({ accelerationIncludingGravity: null }, 0), null)
  assert.equal(readSample({ accelerationIncludingGravity: { x: null, y: null, z: null } }, 0), null)
  assert.equal(readSample({ accelerationIncludingGravity: { x: Number.NaN, y: undefined, z: null } }, 0), null)
})

test('an axis that is missing reads as zero while the others carry data', () => {
  assert.deepEqual(readSample({ accelerationIncludingGravity: { x: null, y: 2, z: null } }, 5), { ax: 0, ay: 2, az: 0, ts: 5 })
})

test('gravity-free acceleration is used when the sensor gives no gravity-inclusive reading', () => {
  assert.deepEqual(readSample({ acceleration: { x: 1, y: 2, z: 3 } }, 0), { ax: 1, ay: 2, az: 3, ts: 0 })
})

test('permission is only asked where the platform has a permission method', async () => {
  assert.equal(needsMotionPermission(undefined), false)
  assert.equal(needsMotionPermission({}), false)
  assert.equal(needsMotionPermission({ requestPermission: async () => 'granted' }), true)
  assert.equal(await requestMotionPermission(undefined), 'granted')
  assert.equal(await requestMotionPermission({}), 'granted', 'nothing to ask elsewhere')
  assert.equal(await requestMotionPermission({ requestPermission: async () => 'granted' }), 'granted')
  assert.equal(await requestMotionPermission({ requestPermission: async () => 'denied' }), 'denied')
  assert.equal(
    await requestMotionPermission({
      requestPermission: async () => {
        throw new Error('not called from a gesture')
      },
    }),
    'denied',
    'a thrown error is a no',
  )
})

test('magnitude is the length of the acceleration vector', () => {
  assert.equal(magnitude({ ax: 3, ay: 4, az: 0 }), 5)
  assert.equal(magnitude({ ax: 0, ay: 0, az: 0 }), 0)
})
