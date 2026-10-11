import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Box } from '../../../cluster/protocol.ts'
import { describeFrame, listClasses } from './summary.ts'

const box = (cls: string, conf = 0.9): Box => ({ x: 0, y: 0, w: 10, h: 10, cls, conf })

test('classes are listed once each, in the order of their first (most confident) box', () => {
  assert.equal(listClasses([box('person'), box('cup'), box('person'), box('laptop')]), 'person, cup, laptop')
  assert.equal(listClasses([]), '')
})

test('a long list is cut with a count of the rest', () => {
  const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  assert.equal(listClasses(names.map((n) => box(n))), 'a, b, c, d, e and 2 more')
  assert.equal(listClasses(names.map((n) => box(n)), 7), 'a, b, c, d, e, f, g')
})

test('the canvas label says what is on screen and what was found', () => {
  assert.match(describeFrame('idle', [], false), /^Test card/)
  assert.match(describeFrame('live', [box('person'), box('cup'), box('laptop')], true), /3 objects detected: person, cup, laptop$/)
  assert.match(describeFrame('live', [box('person')], true), /1 object detected: person$/)
  assert.match(describeFrame('live', [], true), /No objects detected\.$/)
  assert.match(describeFrame('live', [], false), /No detector is loaded, so nothing is detected\.$/)
  assert.match(describeFrame('still', [box('dog')], true), /^Your image/)
  assert.match(describeFrame('replay', [box('dog')], true), /^A recorded run/)
})
