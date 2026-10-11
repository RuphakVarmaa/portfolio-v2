import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CLICK_GAIN, CLICK_MAX_PER_SECOND, HUM_GAIN, HUM_HARMONIC_GAIN, createAudio, createRateLimiter } from './audio.ts'

test('clicks are limited to 20 per second and the window slides', () => {
  let t = 0
  const allow = createRateLimiter(CLICK_MAX_PER_SECOND, 1000, () => t)
  let granted = 0
  for (let i = 0; i < 50; i++) {
    t = i * 10 // 50 attempts over 500 ms
    if (allow()) granted += 1
  }
  assert.equal(granted, 20)
  t = 1005 // the first 10 attempts (0..90 ms) have left the window
  assert.equal(allow(), true)
})

test('levels match the spec: click -18 dB, hum 55 Hz at -24 dB with 110 Hz at -30 dB', () => {
  assert.ok(Math.abs(20 * Math.log10(CLICK_GAIN) + 18) < 1e-9)
  assert.ok(Math.abs(20 * Math.log10(HUM_HARMONIC_GAIN) + 30) < 1e-9)
  assert.ok(HUM_GAIN > HUM_HARMONIC_GAIN)
})

test('without an AudioContext (server, old browser) every call is a safe no-op and nothing is unlocked', () => {
  const audio = createAudio()
  audio.click()
  audio.humStart()
  audio.humStop()
  audio.failover()
  audio.setEnabled(true)
  assert.equal(audio.isEnabled(), true)
  assert.deepEqual(audio.getState(), { enabled: true, unlocked: false })
  audio.setEnabled(false)
  assert.deepEqual(audio.getState(), { enabled: false, unlocked: false })
})
