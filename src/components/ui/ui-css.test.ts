import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

/**
 * Guards over the shared stylesheet for the things a review found by looking at a phone: they are properties of the CSS text, so
 * `node --test` can pin them. (The rendered result, one line at 320 px and so on, was measured in Chrome.)
 */

const SRC = new URL('../../', import.meta.url).pathname
const ui = readFileSync(new URL('./ui.module.css', import.meta.url), 'utf8')

/** The declarations of the first rule whose selector is exactly `selector` (a class), comments removed. */
function rule(css: string, selector: string): string {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const match = new RegExp(`(?:^|\\n)${selector.replace(/[.[\]()]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(stripped)
  assert.ok(match, `no rule for ${selector}`)
  return match[1]
}

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))

test('a metric value is never broken across lines: no "<30m" and "s", at any width', () => {
  const value = rule(ui, '.metricValue')
  assert.match(value, /white-space:\s*nowrap/)
  assert.doesNotMatch(value, /overflow-wrap:\s*anywhere/)
  // The numeral gives way instead: it is sized from the row (a container), so the widest value on the site fits a column.
  assert.match(value, /font-size:\s*min\(var\(--fs-numeral\),\s*calc\(\(100cqi/)
  assert.match(rule(ui, '.metrics'), /container-type:\s*inline-size/)
})

test('the drawing rides beside the demo from 1024 px (when the window is tall enough for it), and the stage list sits under the demo', () => {
  const css = ui.replace(/\/\*[\s\S]*?\*\//g, '')
  const wide = /@media \(min-width: 1024px\) \{[\s\S]*?\n\}\n/.exec(css)
  assert.ok(wide, 'the two-column media block')
  assert.match(wide[0], /\.pipeline\s*\{[^}]*grid-column:\s*1/, 'the stage list is in the demo column')
  assert.match(wide[0], /\.drawing\s*\{[^}]*grid-row:\s*2 \/ span 2/, 'the drawing spans the rows beside the demo: the room it rides in')
  const sticky = /@media \(min-width: 1024px\) and \(min-height: 760px\) \{[\s\S]*?\n\}\n/.exec(css)
  assert.ok(sticky, 'the sticky block is gated on the window height')
  assert.match(sticky[0], /\.drawing\s*\{[^}]*position:\s*sticky/)
  assert.match(sticky[0], /top:\s*calc\(var\(--scroll-offset\)/)
})

test('the tape lays out by its own width, one hole per entry, and never breaks a line in the middle of a token', () => {
  assert.match(rule(ui, '.tape'), /container-type:\s*inline-size/)
  assert.match(rule(ui, '.tapeScroll'), /background-attachment:\s*local/)
  const line = rule(ui, '.tapeLine')
  assert.match(line, /overflow-wrap:\s*break-word/)
  assert.doesNotMatch(line, /overflow-wrap:\s*anywhere/)
  assert.match(ui, /\.tapeLine::before\s*\{/)
  assert.match(ui, /@container tape \(max-width: 559\.98px\)/)
})

test('no ad-hoc 11 or 12 px type: the smallest size is the --fs-micro token, and stencil faces stay at --fs-label or more', () => {
  for (const file of walk(SRC).filter((name) => name.endsWith('.css') && !name.endsWith('tokens.css'))) {
    const css = readFileSync(file, 'utf8')
    assert.doesNotMatch(css, /font-size:\s*(?:0\.75rem|0\.6875rem|1[12]px)\s*;/, `${file} sets a literal micro size`)
  }
  const tokens = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8')
  assert.match(tokens, /--fs-micro:\s*0\.75rem/)
})
