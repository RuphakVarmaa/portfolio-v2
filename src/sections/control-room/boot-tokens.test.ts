import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BOOT_LINE_CLOSING, BOOT_LINE_PRERENDERED, buildBootLine } from '../../cluster/boot-line.ts'
import { NBSP, SEPARATOR, bootText, bootTokens, type BootToken } from './boot-tokens.ts'

const up = (spawnAt: number, readyAt: number) => ({ spawnAt, readyAt, spinUpMs: readyAt - spawnAt })

const TYPICAL = buildBootLine({
  fcp: 412.4,
  workers: { 'retrieval-a': up(100, 530.2), 'policy-a': up(100, 541), 'policy-b': up(100, 543.6), 'review-a': up(100, 561), 'vision-a': up(100, 570) },
  nodes: 2,
  term: 3,
})
/** Four-digit figures everywhere, two-digit counters: the longest line a slow device can print. */
const LONGEST = buildBootLine({
  fcp: 1496.2,
  workers: { 'retrieval-a': up(100, 1161), 'policy-a': up(100, 1364), 'policy-b': up(100, 1366), 'review-a': up(100, 1366), 'vision-a': up(100, 1370) },
  nodes: 12,
  term: 12,
})
const LINES = [TYPICAL, LONGEST, BOOT_LINE_PRERENDERED, 'retrieval up 130 ms · policy starting · review standby · vision standby · 1 node']

/**
 * What a browser does with a line of nowrap tokens: fill a row with as many tokens as fit (a token and the space
 * before it), start the next row with the one that does not. Returns the rows as lists of the units they hold. A
 * unit wider than the row gets a row to itself and overflows, as it would. Below 640 px the closing clause's own
 * space is a place to break (its two pieces are units); above it the clause is one unit.
 */
function rowsOf(tokens: readonly BootToken[], columns: number, narrow: boolean): string[][] {
  const units = tokens.flatMap((token) => (narrow ? token : [token.join(' ')]))
  const rows: string[][] = []
  let width = 0
  for (const unit of units) {
    const row = rows.at(-1)
    if (row !== undefined && width + 1 + unit.length <= columns) {
      row.push(unit)
      width += 1 + unit.length
    } else {
      rows.push([unit])
      width = unit.length
    }
  }
  return rows
}

test('the tokens read back as exactly the line that was measured (a no-break space is the only difference)', () => {
  for (const line of LINES) assert.equal(bootText(bootTokens(line)), line)
  assert.ok(TYPICAL.endsWith(BOOT_LINE_CLOSING), 'the full line carries the closing clause')
})

test('every separator is glued to the token on its left by a no-break space, and no token starts with a dot or a space', () => {
  for (const line of LINES) {
    const tokens = bootTokens(line)
    for (const [index, token] of tokens.entries()) {
      for (const piece of token) assert.ok(!/^[\s\u00A0·]/.test(piece), `token ${index} starts with a separator or a space: ${piece}`)
      const last = index === tokens.length - 1
      assert.equal(token.at(-1)?.endsWith(`${NBSP}${SEPARATOR}`), !last, `token ${index}: the separator belongs to every token but the last`)
    }
    // The only ordinary spaces left in the markup are between tokens (and between the closing clause's two pieces),
    // so a breakable space is never next to a dot.
    const markup = tokens.map((token) => token.join(' ')).join(' ')
    assert.ok(!markup.includes(` ${SEPARATOR}`) && !markup.includes(`${SEPARATOR} ${SEPARATOR}`), 'a breakable space stands before a dot')
  }
  assert.equal(bootTokens(TYPICAL).length, 8, 'FCP, four services, nodes, term, and the closing clause')
})

test('the closing clause is one token of two pieces, parted at its semicolon', () => {
  assert.deepEqual(bootTokens(TYPICAL).at(-1), ['no backend was harmed;', 'this trace is yours.'])
  assert.deepEqual(bootTokens(BOOT_LINE_PRERENDERED), [[`booting ruphak.me v3${NBSP}${SEPARATOR}`], ['node 1 of 1']])
  // Text that is merely similar is not split: only the line's own closing clause is.
  assert.deepEqual(bootTokens('no backend was harmed this trace is yours'), [['no backend was harmed this trace is yours']])
})

test('at every tape width from a phone to a wide desktop no row begins with a dot, and the clause breaks only after its semicolon', () => {
  for (const line of LINES) {
    const tokens = bootTokens(line)
    // Martian Mono is 0.7 em wide: 9.1 px a character at 13 px. The tape's inner width runs from about 260 px (a 320 px phone) to 1330 px.
    for (let columns = 28; columns <= 160; columns += 1) {
      for (const narrow of [true, false]) {
        const rows = rowsOf(tokens, columns, narrow)
        for (const row of rows) assert.ok(!row[0].startsWith(SEPARATOR), `${columns} columns: a row begins with a dot: ${row.join(' ')}`)
        assert.equal(bootText(rows.map((row) => [row.join(' ')])), bootText(tokens), 'wrapping loses or reorders nothing')
        if (!line.endsWith(BOOT_LINE_CLOSING)) continue
        const pieces = rows.flat()
        const harmed = pieces.indexOf('no backend was harmed;')
        const yours = pieces.indexOf('this trace is yours.')
        if (narrow) assert.ok(harmed >= 0 && yours === harmed + 1, `${columns} columns: the clause is out of order`)
        else assert.ok(pieces.includes(BOOT_LINE_CLOSING) && harmed < 0, `${columns} columns: the wide clause is split`)
      }
    }
  }
})

test('on a wide tape the closing clause is the second row, whole; on a phone nothing is wider than the tape', () => {
  // 1280 px wide: about 118 columns. The measurements fill row one, the signature sentence is row two.
  const wide = rowsOf(bootTokens(TYPICAL), 118, false)
  assert.equal(wide.length, 2)
  assert.deepEqual(wide[1], [BOOT_LINE_CLOSING])
  // A 390 px phone: 36 columns of 13 px type. No row is longer than that.
  for (const row of rowsOf(bootTokens(LONGEST), 36, true)) assert.ok(row.join(' ').length <= 36, row.join(' '))
})
