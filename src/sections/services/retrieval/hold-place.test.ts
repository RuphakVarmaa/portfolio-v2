import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placeToHold, scrollToRestore } from './hold-place.ts'

test('only an insertion point above the viewport is held: the visitor is looking at what lies below it', () => {
  // The honest caption is on screen (top 180) but the suggestions above the answers have scrolled away (bottom -420).
  assert.equal(placeToHold(-420, 180), 180)
  assert.equal(placeToHold(-420, -320), -320)
  // Typing a question: the suggestions are on screen or below the fold.
  assert.equal(placeToHold(60, 1500), null)
  assert.equal(placeToHold(0, 1500), null)
  assert.equal(placeToHold(undefined, 180), null)
  assert.equal(placeToHold(-420, undefined), null)
})

test('the page is moved by exactly how far the reference was pushed', () => {
  assert.equal(scrollToRestore(-320, 1100), 1420) // an answer 1,420 px tall was inserted above it
  assert.equal(scrollToRestore(-320, -347), -27) // a block got shorter
})

test('a browser that already kept the place leaves nothing to do, so nothing is applied twice', () => {
  assert.equal(scrollToRestore(-320, -320), 0)
  assert.equal(scrollToRestore(-320, -319.8), 0)
  assert.equal(scrollToRestore(null, 900), 0)
})
