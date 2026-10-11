import assert from 'node:assert/strict'
import { test } from 'node:test'
import { STALE_MS, heldKey, isLabKey, rememberFocus, rememberPress, takeHandoff } from './handoff.ts'

/** A stand-in-shaped fake: just the attribute `heldKey` reads. */
const el = (key: string | null) => ({ getAttribute: (name: string) => (name === 'data-chaos-key' ? key : null) })

/** A frame that contains exactly the elements it is given. */
const frameOf = (...inside: object[]) => ({ contains: (node: object) => inside.includes(node) })

/** A fresh slate: whatever an earlier test left behind is forgotten. */
const clear = () => takeHandoff({ now: 0, focusLost: false })

test('only the two buttons the stand-ins mirror are keys', () => {
  assert.equal(isLabKey('plug'), true)
  assert.equal(isLabKey('tab'), true)
  assert.equal(isLabKey('leader'), false, 'the third experiment has no button')
  assert.equal(isLabKey(null), false)
  assert.equal(isLabKey(undefined), false)
})

test('the stand-in that holds focus is found by its key, and only inside the frame', () => {
  const plug = el('plug')
  const tab = el('tab')
  const stray = el('plug')
  const frame = frameOf(plug, tab)
  assert.equal(heldKey(frame, plug), 'plug')
  assert.equal(heldKey(frame, tab), 'tab')
  assert.equal(heldKey(frame, stray), null, 'a button with the key outside the frame is not a stand-in of this frame')
  assert.equal(heldKey(frame, el(null)), null, 'a focused element with no key (a link, the heading) is nothing to hand over')
  const leader = el('leader')
  assert.equal(heldKey(frameOf(plug, leader), leader), null, 'inside the frame, but only the two buttons are keys')
  assert.equal(heldKey(frame, null), null, 'nothing has focus')
})

test('nothing remembered, nothing to do: a lab that was scrolled to normally takes no one’s focus', () => {
  clear()
  assert.deepEqual(takeHandoff({ now: 100, focusLost: true }), { focus: null, press: null })
})

test('a stand-in that held focus hands it to its twin, once, and only if focus was really lost', () => {
  clear()
  rememberFocus('tab', 1000)
  assert.deepEqual(takeHandoff({ now: 1500, focusLost: true }), { focus: 'tab', press: null })
  assert.deepEqual(takeHandoff({ now: 1600, focusLost: true }), { focus: null, press: null }, 'forgotten once taken: a second mount takes nothing')

  rememberFocus('plug', 2000)
  assert.deepEqual(takeHandoff({ now: 2100, focusLost: false }), { focus: null, press: null }, 'the visitor tabbed on before the bench came: focus is theirs')
})

test('the frame being replaced with nothing focused records that, and clears an earlier focus', () => {
  clear()
  rememberFocus('plug', 1000)
  rememberFocus(null, 1200)
  assert.deepEqual(takeHandoff({ now: 1300, focusLost: true }), { focus: null, press: null })
})

test('a press made before the bench was ready is replayed on its twin, and focus follows it when focus was lost', () => {
  clear()
  rememberPress('plug', 5000)
  assert.deepEqual(takeHandoff({ now: 5400, focusLost: true }), { focus: 'plug', press: 'plug' })

  rememberPress('tab', 6000)
  assert.deepEqual(takeHandoff({ now: 6400, focusLost: false }), { focus: null, press: 'tab' }, 'the press still counts when focus has moved on')
})

test('focus stays where the visitor had it even when they pressed the other stand-in', () => {
  clear()
  rememberPress('plug', 1000)
  rememberFocus('tab', 1100)
  assert.deepEqual(takeHandoff({ now: 1200, focusLost: true }), { focus: 'tab', press: 'plug' })
})

test('a focus or a press that waited too long belongs to someone who has gone: it is dropped', () => {
  clear()
  rememberFocus('plug', 1000)
  rememberPress('tab', 1000)
  assert.deepEqual(takeHandoff({ now: 1000 + STALE_MS + 1, focusLost: true }), { focus: null, press: null })

  rememberPress('tab', 1000)
  assert.deepEqual(takeHandoff({ now: 1000 + STALE_MS, focusLost: true }), { focus: 'tab', press: 'tab' }, 'exactly at the limit is still fresh')
})

test('a press and a focus are aged on their own: an old press does not borrow a fresh focus’s time', () => {
  clear()
  rememberPress('tab', 1000)
  rememberFocus('plug', 1000 + STALE_MS + 500)
  assert.deepEqual(takeHandoff({ now: 1000 + STALE_MS + 600, focusLost: true }), { focus: 'plug', press: null })
})
