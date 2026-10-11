import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BEZEL_R, RELAY_JACKS, RELAY_SHARE, RELAY_VIEWBOX } from './board-art.ts'
import { LAMP_BEZEL, PLUG_OUT, PLUG_OUT_NARROW, SENSORS_BEZEL, cableCurve, layoutGeometry, plug } from './board-cables.ts'
import { BOARD_SIZE, LAMP_ORDER, positionsFor, toUnits, type LayoutKind } from './lamp-positions.ts'

const KINDS: readonly LayoutKind[] = ['wide', 'narrow']

/** Every number in an SVG path, as pairs of coordinates (the paths here use only absolute M, L and C). */
function points(d: string): [number, number][] {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  const out: [number, number][] = []
  for (let i = 0; i + 1 < numbers.length; i += 2) out.push([numbers[i], numbers[i + 1]])
  return out
}

test('the geometry is deterministic: the same lines on the server and the client', () => {
  for (const kind of KINDS) assert.deepEqual(layoutGeometry(kind), layoutGeometry(kind))
})

test('every lamp has a cable, in lamp order, with the stagger index the boot draw uses (90 ms each)', () => {
  for (const kind of KINDS) {
    const geometry = layoutGeometry(kind)
    assert.deepEqual(
      geometry.cables.map((cable) => cable.id),
      [...LAMP_ORDER],
    )
    assert.deepEqual(
      geometry.cables.map((cable) => cable.index),
      [0, 1, 2, 3, 4],
    )
  }
})

test('the board box is the one the CSS aspect ratios describe, and lamps are where lamp-positions.ts says', () => {
  for (const kind of KINDS) {
    const geometry = layoutGeometry(kind)
    assert.equal(geometry.width, BOARD_SIZE[kind].width)
    assert.equal(geometry.height, BOARD_SIZE[kind].height)
    for (const id of LAMP_ORDER) {
      const at = toUnits(kind, positionsFor(kind)[id])
      assert.deepEqual(geometry.lamps[id], [at.x, at.y])
    }
  }
})

test('the relay is centred on the board and as wide as its share of it', () => {
  for (const kind of KINDS) {
    const { relay, width, height } = layoutGeometry(kind)
    assert.ok(Math.abs(relay.x + relay.w / 2 - width / 2) < 1e-9)
    assert.ok(Math.abs(relay.y + relay.h / 2 - height / 2) < 1e-9)
    assert.ok(Math.abs(relay.w - width * RELAY_SHARE[kind]) < 1e-9)
    assert.ok(Math.abs(relay.scale * RELAY_VIEWBOX.width - relay.w) < 1e-9)
    assert.ok(Math.abs(relay.h - relay.w) < 1e-9, 'the relay drawing is square')
  }
})

test('every cable runs from a plug at the relay to a plug at its lamp, all inside the board, with no NaN', () => {
  for (const kind of KINDS) {
    const geometry = layoutGeometry(kind)
    const out = kind === 'wide' ? PLUG_OUT : PLUG_OUT_NARROW
    for (const cable of geometry.cables) {
      assert.ok(!/NaN|undefined|Infinity/.test(cable.d + cable.plugs[0].metal + cable.plugs[1].metal), `${kind} ${cable.id}`)
      assert.match(cable.d, /^M[-\d. ]+C[-\d. ]+$/)
      const [start, c1, c2, end] = points(cable.d)
      // The cable starts where the relay plug ends and ends where the lamp plug ends.
      assert.deepEqual(start, [Number(cable.plugs[0].end[0].toFixed(2)), Number(cable.plugs[0].end[1].toFixed(2))])
      assert.deepEqual(end, [Number(cable.plugs[1].end[0].toFixed(2)), Number(cable.plugs[1].end[1].toFixed(2))])
      for (const [x, y] of [start, c1, c2, end, [cable.mid[0], cable.mid[1]] as [number, number]]) {
        assert.ok(x > 0 && x < geometry.width && y > 0 && y < geometry.height, `${kind} ${cable.id} leaves the board at ${x},${y}`)
      }
      // The relay end of the cable is a plug-length away from one of the relay's own sockets.
      const sockets = Object.values(RELAY_JACKS).map((jack) => [geometry.relay.x + jack.at[0] * geometry.relay.scale, geometry.relay.y + jack.at[1] * geometry.relay.scale])
      const nearest = Math.min(...sockets.map(([x, y]) => Math.hypot(x - start[0], y - start[1])))
      assert.ok(Math.abs(nearest - out) < 0.1, `${kind} ${cable.id}: relay plug ${nearest} from its socket, expected ${out}`)
    }
  }
})

test('the lamp end of each cable is one plug-length from the lamp bezel', () => {
  for (const kind of KINDS) {
    const geometry = layoutGeometry(kind)
    const out = kind === 'wide' ? PLUG_OUT : PLUG_OUT_NARROW
    for (const cable of geometry.cables) {
      const bezel = cable.id === 'sensors' ? SENSORS_BEZEL[kind] : LAMP_BEZEL[kind]
      const [lx, ly] = geometry.lamps[cable.id]
      const [ex, ey] = cable.plugs[1].end
      const distance = Math.hypot(ex - lx, ey - ly)
      // A face of the hexagon is 0.866 R from the centre, a side vertex R; the plug reaches `out` further.
      assert.ok(distance >= bezel * 0.866 + out - 0.01 && distance <= bezel + out + 0.01, `${kind} ${cable.id}: ${distance}`)
    }
  }
})

test('the wide board wires the left lamps to the left sockets and the right lamps to the right; the portrait board uses the top and bottom', () => {
  const wide = layoutGeometry('wide')
  const startOf = (id: string, g = wide) => points(g.cables.find((cable) => cable.id === id)!.d)[0]
  assert.ok(startOf('retrieval')[0] < wide.relay.x && startOf('policy')[0] < wide.relay.x)
  assert.ok(startOf('vision')[0] > wide.relay.x + wide.relay.w && startOf('review')[0] > wide.relay.x + wide.relay.w)
  assert.ok(startOf('sensors')[1] > wide.relay.y + wide.relay.h, 'the sensors cable leaves the bottom of the relay')
  const narrow = layoutGeometry('narrow')
  assert.ok(startOf('retrieval', narrow)[1] < narrow.relay.y && startOf('vision', narrow)[1] < narrow.relay.y)
  assert.ok(startOf('policy', narrow)[1] > narrow.relay.y + narrow.relay.h && startOf('review', narrow)[1] > narrow.relay.y + narrow.relay.h)
  assert.ok(startOf('sensors', narrow)[1] < narrow.relay.y, 'the sensors cable leaves the top of the relay')
})

test('the board never lets two plugs from different cables share a relay socket', () => {
  for (const kind of KINDS) {
    const geometry = layoutGeometry(kind)
    const starts = geometry.cables.map((cable) => points(cable.d)[0].join(','))
    assert.equal(new Set(starts).size, starts.length, `${kind}: two cables start at the same socket`)
  }
})

test('plug(): the end is `out` away from the jack along its direction, and the metal is a closed outline', () => {
  const jack = { at: [100, 50] as [number, number], dir: [-1, 0] as [number, number] }
  const p = plug(jack, 30)
  assert.deepEqual(p.end, [70, 50])
  // Ferrule and barrel are closed rectangles, the collar a single line across the barrel; the boot is a closed quadrilateral.
  assert.match(p.metal, /^(M[\d. -]+(L[\d. -]+){3}Z){2}M[\d. -]+L[\d. -]+$/)
  assert.match(p.boot, /^M[\d. -]+(L[\d. -]+){3}Z$/)
  assert.deepEqual(plug({ at: [0, 0], dir: [0, 1] }, 24).end, [0, 24])
})

test('cableCurve(): a cubic that leaves each plug along its own axis, with gravity (sag) pulling both control points down', () => {
  const { d, mid } = cableCurve([0, 0], [1, 0], [200, 100], [-1, 0], { sag: 30, bow: 0, seed: 't' })
  const [start, c1, c2, end] = points(d)
  assert.deepEqual([start, end], [[0, 0], [200, 100]])
  assert.ok(c1[0] > 0 && c2[0] < 200, 'leaves along the plug axes')
  assert.ok(c1[1] > 25 && c1[1] < 35 && c2[1] > 125 && c2[1] < 135, 'sags by about 30')
  assert.ok(mid[0] > 80 && mid[0] < 120, 'the midpoint is about halfway across')
  assert.equal(cableCurve([0, 0], [1, 0], [200, 100], [-1, 0], { sag: 30, bow: 0, seed: 't' }).d, d)
  assert.notEqual(cableCurve([0, 0], [1, 0], [200, 100], [-1, 0], { sag: 30, bow: 0, seed: 'u' }).d, d, 'a different seed hangs a little differently')
})

test('the lamp bezel radii used for the plug sockets agree with the art (wide) and the CSS scale (portrait)', () => {
  assert.equal(LAMP_BEZEL.wide, BEZEL_R)
  assert.ok(LAMP_BEZEL.narrow < LAMP_BEZEL.wide && SENSORS_BEZEL.narrow < LAMP_BEZEL.narrow && SENSORS_BEZEL.wide < LAMP_BEZEL.wide)
})
