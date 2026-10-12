import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FIRST_SCREEN, firstScreenFor, revealDelta } from './reveal.ts'

// A 1440 x 900 window: the sticky header covers the top 76 px, the status strip the bottom 52 px.
const desktop = { top: 76, bottom: 848 }
// A 390 x 844 phone: the header scrolls away, the strip still covers the bottom 52 px.
const phone = { top: 0, bottom: 792 }

test('an answer whose first screen is already in view does not move the page', () => {
  assert.equal(revealDelta({ top: 300, height: 1500 }, desktop), 0)
  assert.equal(revealDelta({ top: desktop.bottom - FIRST_SCREEN, height: 1500 }, desktop), 0, 'exactly fits')
  assert.equal(revealDelta({ top: 600, height: 120 }, desktop), 0, 'a short answer needs only its own height')
})

test('an answer that lands below the fold moves up by the least that shows its first screen', () => {
  // Its top is at 700: the first screenful ends 332 px under the bottom of the room.
  assert.equal(revealDelta({ top: 700, height: 1500 }, desktop), 700 + FIRST_SCREEN - desktop.bottom)
  // On the phone the answer starts under the three suggestions.
  assert.equal(revealDelta({ top: 640, height: 900 }, phone), 640 + FIRST_SCREEN - phone.bottom)
  // A short answer (a "nothing matches" box) needs less.
  assert.equal(revealDelta({ top: 800, height: 90 }, desktop), 800 + 90 - desktop.bottom)
})

test('it never moves the page past the point where the answer\'s label is at the top of the room', () => {
  // Far below the fold, and a window too short to show a whole first screen: label at the top (16 px under the header), no further.
  const short = { top: 76, bottom: 76 + 300 }
  assert.equal(revealDelta({ top: 1200, height: 1500 }, short), 1200 - (76 + 16))
  // The label is already near the top and the room is short: nothing to gain, so nothing moves.
  assert.equal(revealDelta({ top: 90, height: 1500 }, short), 0)
})

test('an answer hidden behind the header, or above the screen, is brought back down', () => {
  assert.equal(revealDelta({ top: 20, height: 900 }, desktop), 20 - (76 + 16))
  assert.equal(revealDelta({ top: -300, height: 900 }, desktop), -300 - (76 + 16))
  assert.ok(revealDelta({ top: 20, height: 900 }, desktop) < 0, 'negative is up the page')
})

test('on a phone, with nothing at the top, an answer at the very top of the screen stays', () => {
  assert.equal(revealDelta({ top: 0, height: 900 }, phone), 0)
  assert.equal(revealDelta({ top: -4, height: 900 }, phone), -4 - 16)
})

test('the first screenful runs down to the best card\'s link when that is lower than the usual 480 px', () => {
  assert.equal(firstScreenFor(null, 300), FIRST_SCREEN, 'no link: the usual first screen')
  assert.equal(firstScreenFor(300 + 200, 300), FIRST_SCREEN, 'a link that is already within it changes nothing')
  assert.equal(firstScreenFor(300 + 698, 300), 698 + 12, 'a phone wraps the passage: the link is further down, and 12 px of air under it')
  // With that, an answer whose link would be under the status strip is moved up until the link is clear of it.
  const link = firstScreenFor(1180, 700)
  assert.equal(revealDelta({ top: 700, height: 1500 }, { top: 76, bottom: 848 }, link), 700 + link - 848)
})
