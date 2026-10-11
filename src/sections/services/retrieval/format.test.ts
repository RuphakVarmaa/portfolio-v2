import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fmtMs } from './format.ts'

test('a measured time is never printed as zero', () => {
  assert.equal(fmtMs(0), '<0.1 ms')
  assert.equal(fmtMs(0.019), '<0.1 ms')
  assert.equal(fmtMs(0.049), '<0.1 ms')
})

test('everything else reads as the cluster prints it', () => {
  assert.equal(fmtMs(0.05), '0.1 ms')
  assert.equal(fmtMs(0.2), '0.2 ms')
  assert.equal(fmtMs(7.34), '7.3 ms')
  assert.equal(fmtMs(14.4), '14 ms')
  assert.equal(fmtMs(412), '412 ms')
})
