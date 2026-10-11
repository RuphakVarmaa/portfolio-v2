import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REVIEW_STRINGS as t } from './strings.ts'

test('the plain reading of a result says how many things, in how many lines, and the most serious tier', () => {
  assert.equal(
    t.plainReview({ findings: 7, lines: 22, worst: { name: 'Critical', shape: '◆' }, parsed: true }),
    'The reviewer found 7 things to look at in 22 lines and sorted them into five levels of seriousness. The most serious here is Critical (◆). The notes beside the code say what is wrong and how to fix it.',
  )
  assert.match(t.plainReview({ findings: 1, lines: 1, worst: { name: 'Info', shape: '○' }, parsed: true }), /found 1 thing to look at in 1 line /)
})

test('a result with no findings does not pretend the code is right', () => {
  const sentence = t.plainReview({ findings: 0, lines: 8, worst: null, parsed: true })
  assert.equal(sentence, 'The reviewer read 8 lines and found nothing to flag.')
  assert.match(t.noFindings(8), /not a certificate/)
})

test('when the AST pass was skipped the plain reading says the list is shorter', () => {
  const sentence = t.plainReview({ findings: 2, lines: 8, worst: { name: 'Low', shape: '■' }, parsed: false })
  assert.match(sentence, /did not run on this text, so the list is shorter/)
})

test('the parser message carries the position when there is one', () => {
  assert.equal(t.parserSaid({ message: "The keyword 'interface' is reserved", line: 1, column: 0 }), "The parser said: The keyword 'interface' is reserved, at line 1, column 1.")
  assert.equal(t.parserSaid({ message: 'the parser could not be loaded', line: 0, column: 0 }), 'The parser said: the parser could not be loaded.')
})

test('the galley strings count lines the way the diff does', () => {
  assert.equal(t.hunk(22, 'express-route.js'), '@@ -0,0 +1,22 @@ express-route.js')
  assert.equal(t.flagged(6, 1), 'Line 6, 1 finding.')
  assert.equal(t.flagged(10, 2), 'Line 10, 2 findings.')
  assert.equal(t.lines(2, 71), 'lines 2 to 71')
  assert.equal(t.lines(5), 'line 5')
})

test('the tier buttons are named with their visible label first (label in name)', () => {
  assert.equal(t.jumpLabel('T1 Critical', 2), 'T1 Critical 2, go to the first')
  assert.ok(t.jumpLabel('T4 Low', 3).startsWith('T4 Low 3'))
})

test('the timings are written in the unit the work took', () => {
  assert.equal(t.total(0.86), '0.86 ms in the worker')
  assert.equal(t.total(0.002), '2 µs in the worker')
  assert.equal(t.roundTrip(103), '103 ms round trip on this page')
})

test('a summary counts findings and lines', () => {
  assert.equal(t.summary(0, 1), 'No findings in 1 line')
  assert.equal(t.summary(7, 22), '7 findings in 22 lines')
  assert.equal(t.count(1234, 20_000), '1,234 of 20,000 characters')
})
