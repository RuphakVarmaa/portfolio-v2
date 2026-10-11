import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { BEZEL_R, GLOW_RINGS } from './board-art.ts'
import { LAMP_BEZEL, SENSORS_BEZEL, layoutGeometry } from './board-cables.ts'
import { BOARD_SIZE, GLOW_SCALE, LAMP_ORDER, type LampId, type LayoutKind } from './lamp-positions.ts'

const KINDS: readonly LayoutKind[] = ['wide', 'narrow']

/** How far a lit lamp's outermost (12 %) ring reaches from its centre, in board units, in this layout. */
function reach(kind: LayoutKind, id: LampId): number {
  const bezel = id === 'sensors' ? SENSORS_BEZEL[kind] : LAMP_BEZEL[kind]
  return GLOW_RINGS[0].r * (bezel / BEZEL_R) * GLOW_SCALE[kind]
}

test('no two lit lamps\' glows touch, in either layout: the translucent steps would add up to a darker band between them', () => {
  for (const kind of KINDS) {
    const { lamps } = layoutGeometry(kind)
    for (const [i, a] of LAMP_ORDER.entries()) {
      for (const b of LAMP_ORDER.slice(i + 1)) {
        const distance = Math.hypot(lamps[a][0] - lamps[b][0], lamps[a][1] - lamps[b][1])
        // Two board units of air between the two outer rings (about two pixels on a phone).
        assert.ok(distance >= reach(kind, a) + reach(kind, b) + 2, `${kind}: ${a} and ${b} are ${distance.toFixed(1)} apart, their glows reach ${(reach(kind, a) + reach(kind, b)).toFixed(1)}`)
      }
    }
  }
})

test('every glow stays inside the board (the portrait one entirely), or the board clips it; and each still shows well beyond its own bezel', () => {
  const css = readFileSync(new URL('./ControlRoom.module.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const clips = /\.board \{[^}]*overflow:\s*clip;/.test(css)
  for (const kind of KINDS) {
    const { lamps } = layoutGeometry(kind)
    const { width, height } = BOARD_SIZE[kind]
    for (const id of LAMP_ORDER) {
      const r = reach(kind, id)
      const [x, y] = lamps[id]
      const inside = x - r > 0 && x + r < width && y - r > 0 && y + r < height
      // The SENSORS lamp sits at 90 % of the landscape board (spec 4.1): its outer ring, 80 units out, passes the frame, and the panel clips it.
      assert.ok(inside || (kind === 'wide' && clips), `${kind} ${id}: the glow leaves the board and nothing clips it`)
      assert.ok(r > (id === 'sensors' ? SENSORS_BEZEL[kind] : LAMP_BEZEL[kind]) * 1.5, `${kind} ${id}: the halo is hardly wider than the bezel`)
    }
  }
  assert.ok(clips, 'the board clips what leaks past its frame')
})

test('the glow scale is a reduction for the crowded portrait board only, and the stylesheet repeats it (--gs)', () => {
  assert.equal(GLOW_SCALE.wide, 1)
  assert.ok(GLOW_SCALE.narrow < 1 && GLOW_SCALE.narrow >= 0.7, 'a smaller halo on the phone board, never a token one')
  const css = readFileSync(new URL('./ControlRoom.module.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const base = /\.lamp \{[^}]*--gs:\s*([\d.]+);/.exec(css)
  assert.equal(Number(base?.[1]), GLOW_SCALE.narrow, 'the portrait board is the default')
  const wide = /@media \(min-width: 900px\) \{[\s\S]*?\.lamp \{\s*--gs:\s*([\d.]+);/.exec(css)
  assert.equal(Number(wide?.[1]), GLOW_SCALE.wide, 'the landscape board restores the full glow')
  // The rings are scaled about the lamp's centre by that property, all four of them (the dithered halo is its own circle).
  assert.match(css, /\.g1,\s*\.g2,\s*\.g3,\s*\.gd \{\s*transform: scale\(var\(--gs, 1\)\);/)
})
