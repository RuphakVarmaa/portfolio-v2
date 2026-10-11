import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { hexagon } from '../../lib/draw/paths.ts'
import {
  ARM_LENGTH,
  ARM_PIVOT,
  ARM_THROW_DEG,
  BEZEL_R,
  CONTACTS,
  GLOW_RINGS,
  JACK_R,
  LAMP_ART_W,
  LAMP_HALF,
  LENS_R,
  RELAY_JACKS,
  RELAY_VIEWBOX,
  RELAY_WINDOW,
  hexBezel,
  lampArt,
  relayArt,
} from './board-art.ts'

const css = readFileSync(new URL('./ControlRoom.module.css', import.meta.url), 'utf8')

test('the drawing is a pure function of fixed seeds: the server and the client draw the same lines', () => {
  assert.deepEqual(lampArt(), lampArt())
  assert.deepEqual(relayArt(), relayArt())
  assert.equal(hexBezel(), hexBezel())
})

test('the section hexagon is the one every other section number carries (same path as the Section bezel)', () => {
  assert.equal(hexBezel(), hexagon(24, 24, 20, 'section:bezel', 0.7))
})

test('no path anywhere is NaN, and every drawn path is a single closed or open pen stroke', () => {
  const lamp = lampArt()
  const relay = relayArt()
  const paths = [lamp.bezel, lamp.focus, lamp.glare, lamp.halves.left, lamp.halves.right, relay.body, relay.winding, relay.flanges, relay.core, relay.yoke, relay.arm, relay.posts, relay.screwSlots, relay.window.outer, relay.window.inner, hexBezel()]
  for (const d of paths) {
    assert.ok(/^M/.test(d), d)
    assert.ok(!/NaN|undefined|Infinity/.test(d), d)
  }
})

test('the lamp: a hexagonal bezel 1.34 x the lens, four hard glow steps (12, 30, 60 and 100 %), and an art box with room for the bezel and its shadow', () => {
  const art = lampArt()
  assert.equal(art.lensR, LENS_R)
  assert.ok(Math.abs(BEZEL_R - LENS_R * 1.34) < 1e-9)
  assert.deepEqual(
    GLOW_RINGS.map((ring) => [ring.r, ring.level]),
    [
      [102.6, 3],
      [79.8, 2],
      [58.9, 1],
    ],
  )
  // Largest first, all bigger than the lens, and the 60 % ring is the lens' 1.55 x.
  assert.ok(GLOW_RINGS.every((ring, i) => ring.r > LENS_R && (i === 0 || ring.r < GLOW_RINGS[i - 1].r)))
  assert.equal(LAMP_HALF, Math.ceil(BEZEL_R + 4))
  assert.equal(LAMP_ART_W, 110)
  assert.equal(art.viewBox, '-55 -55 110 110')
  assert.ok(art.shadow + BEZEL_R < LAMP_HALF, 'the hard shadow stays inside the art box')
  assert.ok(art.grooveR < BEZEL_R && art.grooveR > LENS_R && art.innerR < LENS_R)
})

test('the two half-lenses together are the whole lens, split down the middle', () => {
  const { halves } = lampArt()
  assert.equal(halves.left, `M0 ${-LENS_R}A${LENS_R} ${LENS_R} 0 0 0 0 ${LENS_R}Z`)
  assert.equal(halves.right, `M0 ${-LENS_R}A${LENS_R} ${LENS_R} 0 0 1 0 ${LENS_R}Z`)
})

test('the relay arm lands on its contacts: at +-18 degrees the tip is within a contact radius of one of them, a different one each way', () => {
  // sin(18) and cos(18) as constants (no trigonometry in the drawing code, and none needed here).
  const sin18 = 0.3090169943749474
  const cos18 = 0.9510565162951535
  assert.equal(ARM_THROW_DEG, 18)
  // Rotation is clockwise-positive: the arm hangs down, so +18 swings the tip to the left (the `in` contact) and -18 to the right (`out`).
  const tipAt = (degrees: number): [number, number] => [ARM_PIVOT[0] - Math.sign(degrees) * ARM_LENGTH * sin18, ARM_PIVOT[1] + ARM_LENGTH * cos18]
  const nearest = (tip: [number, number]) => {
    const distances = CONTACTS.map((c) => Math.hypot(c[0] - tip[0], c[1] - tip[1]))
    return { index: distances.indexOf(Math.min(...distances)), distance: Math.min(...distances) }
  }
  const inward = nearest(tipAt(ARM_THROW_DEG))
  const outward = nearest(tipAt(-ARM_THROW_DEG))
  assert.equal(inward.index, 0)
  assert.equal(outward.index, 1)
  assert.ok(inward.distance < 5 && outward.distance < 5, `the tip misses a contact: ${inward.distance}, ${outward.distance}`)
  assert.ok(CONTACTS[0][0] < ARM_PIVOT[0] && CONTACTS[1][0] > ARM_PIVOT[0], 'one contact each side of the pivot')
})

test('the relay window, as CSS percentages of the relay box, matches the drawing (the HTML readouts are laid over it)', () => {
  const percent = (n: number, of: number) => Math.round((n / of) * 10000) / 100
  const rule = /\.relayWindow\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  const read = (name: string) => Number(new RegExp(`${name}:\\s*([\\d.]+)%`).exec(rule)?.[1])
  assert.equal(read('left'), percent(RELAY_WINDOW.x, RELAY_VIEWBOX.width))
  assert.equal(read('top'), percent(RELAY_WINDOW.y, RELAY_VIEWBOX.height))
  assert.equal(read('width'), percent(RELAY_WINDOW.w, RELAY_VIEWBOX.width))
  assert.equal(read('height'), percent(RELAY_WINDOW.h, RELAY_VIEWBOX.height))
})

test('ten sockets sit on the housing edges, each facing outward; the wide board uses the sides, the portrait one the top and bottom', () => {
  const entries = Object.entries(RELAY_JACKS)
  assert.equal(entries.length, 10)
  for (const [name, jack] of entries) {
    const [x, y] = jack.at
    assert.ok(x === 0 || x === RELAY_VIEWBOX.width || y === 0 || y === RELAY_VIEWBOX.height, `${name} is not on an edge`)
    assert.equal(Math.hypot(jack.dir[0], jack.dir[1]), 1, `${name} direction is not a unit vector`)
    const outward = (x === 0 && jack.dir[0] === -1) || (x === RELAY_VIEWBOX.width && jack.dir[0] === 1) || (y === 0 && jack.dir[1] === -1) || (y === RELAY_VIEWBOX.height && jack.dir[1] === 1)
    assert.ok(outward, `${name} faces into the housing`)
  }
  assert.ok(JACK_R > 0 && relayArt().jackR === JACK_R)
})

test('byte budget: the prerendered relay drawing stays small (the home page is capped at 60 KB for every section together)', () => {
  const relay = relayArt()
  assert.ok(relay.body.length < 700, `relay housing path is ${relay.body.length} bytes`)
  // The housing is rounded to one decimal.
  assert.ok(!/\d\.\d\d/.test(relay.body))
  const total = JSON.stringify(relay).length + JSON.stringify(lampArt()).length
  assert.ok(total < 3500, `art is ${total} bytes of JSON`)
})
