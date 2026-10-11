import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SERVICE_ORDER } from './copy.ts'
import { getSchematic, loadNodeCopy } from './schematics.ts'

test('every schematic places every part in both layouts, on distinct cells, with edges that point at real parts', async () => {
  for (const service of SERVICE_ORDER) {
    const schematic = getSchematic(service)
    assert.equal(schematic.service, service)
    const ids = schematic.nodes.map((n) => n.id)
    assert.equal(new Set(ids).size, ids.length, `${service}: duplicate part ids`)
    for (const kind of ['wide', 'narrow'] as const) {
      const cells = schematic.nodes.map((n) => n[kind].join(','))
      assert.equal(new Set(cells).size, cells.length, `${service} ${kind}: two parts share a cell`)
    }
    assert.ok(schematic.nodes.every((n) => n.narrow[0] <= 2), `${service}: the narrow layout has at most three columns`)
    assert.ok(schematic.nodes.every((n) => n.wide[0] <= 5), `${service}: the wide layout has at most six columns`)
    for (const [from, to] of schematic.edges) {
      assert.ok(ids.includes(from) && ids.includes(to), `${service}: edge ${from} -> ${to}`)
      assert.notEqual(from, to)
    }
    // Every part is connected to something.
    for (const id of ids) assert.ok(schematic.edges.some(([a, b]) => a === id || b === id), `${service}: ${id} is not connected`)
    // The title and description feed the SVG <title>/<desc>.
    assert.ok(schematic.title.length > 5 && schematic.desc.length > 60)
  }
})

test('edges never skip over another part in either layout (adjacent cells only), so no connector crosses a box', () => {
  for (const service of SERVICE_ORDER) {
    const schematic = getSchematic(service)
    const byId = new Map(schematic.nodes.map((n) => [n.id, n]))
    for (const [from, to] of schematic.edges) {
      for (const kind of ['wide', 'narrow'] as const) {
        const a = byId.get(from)![kind]
        const b = byId.get(to)![kind]
        assert.ok(Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1, `${service} ${kind}: ${from} -> ${to} spans more than one cell`)
      }
    }
  }
})

test('part copy loads lazily, once, and covers every part', async () => {
  const first = loadNodeCopy('policy')
  assert.equal(loadNodeCopy('policy'), first, 'cached: the same promise')
  const copy = await first
  assert.deepEqual(Object.keys(copy), getSchematic('policy').nodes.map((n) => n.id))
})
