import assert from 'node:assert/strict'
import { test } from 'node:test'
import { messageText } from './strings.ts'

test('a status line only points at "drop an image" where that control is offered', () => {
  for (const kind of ['denied', 'no-camera', 'camera-error'] as const) {
    assert.match(messageText({ kind }), /You can still drop an image\./, `${kind}: offered by default`)
    assert.match(messageText({ kind }, true), /You can still drop an image\./, `${kind}: offered`)
    const without = messageText({ kind }, false)
    assert.doesNotMatch(without, /drop/i, `${kind}: not offered, so not mentioned`)
    assert.match(without, /\.$/, `${kind}: still a whole sentence`)
  }
  // The other lines never mention it.
  assert.equal(messageText({ kind: 'busy' }, false), messageText({ kind: 'busy' }, true))
  assert.equal(messageText({ kind: 'idle' }, false), messageText({ kind: 'idle' }, true))
})
