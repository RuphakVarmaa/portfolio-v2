import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/**
 * Guards over the Vision stylesheet for what a review found by looking at the panel in a stalled run: they are properties of
 * the CSS text, so `node --test` can pin them. (The rendered result was checked in Chrome at 760, 360 and 320 px wide, in Paper and Ink.)
 */

const css = readFileSync(new URL('./Vision.module.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** The declarations of every rule that has `selector` as one of its comma-separated selectors, joined. */
function declarations(selector: string): string {
  const found: string[] = []
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (block[1].split(',').some((part) => part.trim() === selector)) found.push(block[2])
  }
  assert.ok(found.length > 0, `no rule for ${selector}`)
  return found.join('\n')
}

test('a card bumped out of the rack is clipped to it, top and bottom, so it never travels over the caption above or the labels below', () => {
  const layer = declarations('.cards')
  assert.match(layer, /position:\s*absolute/)
  assert.match(layer, /inset:\s*0\s*;/, 'the layer is exactly the rack\'s box')
  // `inset(0 -1rem)`: cut at the top and bottom edge of the box, open to the sides so a new card still slides in from the left.
  assert.match(layer, /clip-path:\s*inset\(0\s+-\d+(?:\.\d+)?rem\)/)
})

test('the worker\'s lamp is outside the clipped layer: it hangs over the rack\'s corner', () => {
  assert.match(declarations('.bayLamp'), /top:\s*-0\.7rem/)
  assert.doesNotMatch(declarations('.cards'), /overflow/, 'the layer is clipped with clip-path, so nothing but its own cards is cut')
})

test('the backpressure stamp is in the dock along the lower edge, never anchored to the top where the status label is', () => {
  const dock = declarations('.dock')
  assert.match(dock, /position:\s*absolute/)
  assert.match(dock, /inset:\s*auto\s+var\(--s-2\)\s+var\(--s-2\)/, 'anchored to the bottom edge, the top-left corner left free')
  assert.match(dock, /flex-direction:\s*column/, 'what is in it is stacked, so nothing lies over anything else')
  const stamp = declarations('.stamp')
  assert.doesNotMatch(stamp, /(?:^|[\s;])(?:top|bottom|left|right|position)\s*:/, 'the stamp is a flex item of the dock, not placed on the picture')
  assert.match(stamp, /margin-bottom:/, 'room for the corner that a tilted stamp dips below its box')
})

test('the download strip and the "drop to process" tag are stacked in the dock too, not placed over the stamp', () => {
  for (const name of ['.loading', '.dropTag']) {
    assert.doesNotMatch(declarations(name), /(?:^|[\s;])(?:top|bottom|left|right|position|inset)\s*:/, `${name} is a flex item of the dock`)
  }
})

test('the status label keeps the top-left of the picture to itself', () => {
  const tag = declarations('.tag')
  assert.match(tag, /position:\s*absolute/)
  assert.match(tag, /top:\s*var\(--s-3\)/)
  assert.match(tag, /left:\s*var\(--s-3\)/)
  for (const name of ['.stamp', '.loading', '.dropTag']) assert.doesNotMatch(declarations(name), /\btop\s*:/, `${name} is not placed from the top`)
})
