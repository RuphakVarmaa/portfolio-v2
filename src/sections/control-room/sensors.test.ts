import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectMotionSensors, type SensorEnvironment } from './sensors.ts'

const coarse = (matches: boolean) => (query: string) => ({ matches: query === '(pointer: coarse)' && matches })

test('no DeviceMotionEvent, no SENSORS lamp', () => {
  assert.equal(detectMotionSensors({}), false)
  assert.equal(detectMotionSensors({ DeviceMotionEvent: undefined, matchMedia: coarse(true) }), false)
  assert.equal(detectMotionSensors({ DeviceMotionEvent: null, matchMedia: coarse(true) }), false)
})

test('desktop Chrome and Firefox expose the interface but never fire it: no lamp (fine pointer, no touch)', () => {
  const desktop: SensorEnvironment = { DeviceMotionEvent: function DeviceMotionEvent() {}, matchMedia: coarse(false), maxTouchPoints: 0, platform: 'MacIntel' }
  assert.equal(detectMotionSensors(desktop), false)
  assert.equal(detectMotionSensors({ ...desktop, platform: 'Win32' }), false)
})

test('a phone or tablet (coarse primary pointer) gets the lamp', () => {
  assert.equal(detectMotionSensors({ DeviceMotionEvent: function DeviceMotionEvent() {}, matchMedia: coarse(true), maxTouchPoints: 5, platform: 'Linux armv8l' }), true)
  assert.equal(detectMotionSensors({ DeviceMotionEvent: function DeviceMotionEvent() {}, matchMedia: coarse(true), maxTouchPoints: 5, platform: 'iPhone' }), true)
})

test('an iPad that reports a desktop user agent (MacIntel with multi-touch) gets the lamp; a real Mac does not', () => {
  const base = { DeviceMotionEvent: function DeviceMotionEvent() {}, matchMedia: coarse(false), platform: 'MacIntel' }
  assert.equal(detectMotionSensors({ ...base, maxTouchPoints: 5 }), true)
  assert.equal(detectMotionSensors({ ...base, maxTouchPoints: 1 }), false)
  assert.equal(detectMotionSensors({ ...base, maxTouchPoints: 0 }), false)
})

test('an engine that rejects the media query, or has no matchMedia, falls back to the iPad check', () => {
  const throwing = () => {
    throw new Error('unsupported')
  }
  assert.equal(detectMotionSensors({ DeviceMotionEvent: function DeviceMotionEvent() {}, matchMedia: throwing, platform: 'MacIntel', maxTouchPoints: 5 }), true)
  assert.equal(detectMotionSensors({ DeviceMotionEvent: function DeviceMotionEvent() {}, matchMedia: throwing, platform: 'Linux x86_64' }), false)
  assert.equal(detectMotionSensors({ DeviceMotionEvent: function DeviceMotionEvent() {} }), false)
})
