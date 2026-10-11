import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PRODUCTION_ONLY, STAGE_NODES } from './replay.ts'
import { S } from './strings.ts'

test('the note under the timings names every part that stays dark and every stage that lights nothing, so it cannot drift from the replay', () => {
  const note = S.drawingNote.toLowerCase()
  for (const part of PRODUCTION_ONLY) assert.ok(note.includes(part), `the note does not mention the production-only part "${part}"`)
  const unlit = Object.entries(STAGE_NODES)
    .filter(([, nodes]) => nodes.length === 0)
    .map(([stage]) => stage)
  assert.deepEqual(unlit, ['tokenize'], 'a new stage without a part needs a sentence in the note')
  for (const stage of unlit) assert.ok(note.includes(stage), `the note does not mention the stage "${stage}", which lights nothing`)
})

test('the note says what is true of the port: no LLM, no agents, and it states no time of its own', () => {
  assert.match(S.drawingNote, /no LLM/)
  assert.match(S.drawingNote, /production only/)
  assert.ok(!/\d/.test(S.drawingNote), 'a note that is always on screen carries no number: every number on this panel is measured')
})
