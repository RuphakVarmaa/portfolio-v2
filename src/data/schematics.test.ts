import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SERVICE_ORDER } from './copy.ts'
import { getSchematic, loadNodeCopy, type Cell } from './schematics.ts'

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

test('a connector never crosses a part, in either layout: it spans more than one cell only along one row, and only over empty cells', () => {
  for (const service of SERVICE_ORDER) {
    const schematic = getSchematic(service)
    const byId = new Map(schematic.nodes.map((n) => [n.id, n]))
    for (const kind of ['wide', 'narrow'] as const) {
      const taken = new Set(schematic.nodes.map((n) => n[kind].join(',')))
      for (const [from, to] of schematic.edges) {
        const a = byId.get(from)![kind]
        const b = byId.get(to)![kind]
        const columns = Math.abs(a[0] - b[0])
        const rows = Math.abs(a[1] - b[1])
        assert.ok(rows <= 1, `${service} ${kind}: ${from} -> ${to} spans ${rows + 1} rows`)
        if (columns <= 1) continue
        // Further than the next column (the review drawing's PR diff reaches GitHub Actions over the empty cell between them):
        // only along one row, and only over cells nothing sits in, so the line crosses no box.
        assert.equal(rows, 0, `${service} ${kind}: ${from} -> ${to} jumps columns on a slant`)
        const [low, high] = a[0] < b[0] ? [a[0], b[0]] : [b[0], a[0]]
        for (let column = low + 1; column < high; column++) {
          assert.ok(!taken.has(`${column},${a[1]}`), `${service} ${kind}: ${from} -> ${to} runs over a part at column ${column}`)
        }
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

// ---- the review drawing's layout (review round 2, craft: its one sideways connector was a stub) ----------------------

const base = getSchematic('review')
const placed = base.nodes
const cell = (id: string, kind: 'wide' | 'narrow'): Cell => {
  const found = placed.find((part) => part.id === id)
  assert.ok(found, `no part ${id}`)
  return found[kind]
}

test('the review drawing has all eight parts, in order, one cell each', () => {
  // The parts are the copy's, in the copy's order (the order is the tab order); a part with no placement would throw.
  assert.deepEqual(
    placed.map((part) => part.id),
    ['diff', 'actions', 'docker', 'eslint', 'semgrep', 'llm', 'tier', 'comments'],
  )
  for (const kind of ['wide', 'narrow'] as const) {
    const cells = placed.map((part) => part[kind].join(','))
    assert.equal(new Set(cells).size, cells.length, `${kind}: two parts share a cell`)
  }
})

test('the drawing keeps the size the rest of the page was built around: three columns and five rows narrow, five columns and three rows wide', () => {
  // Five narrow rows is what fits under the header and above the status strip while the drawing is sticky beside the demo.
  assert.equal(Math.max(...placed.map((part) => part.narrow[0])) + 1, 3)
  assert.equal(Math.max(...placed.map((part) => part.narrow[1])) + 1, 5)
  // Five wide columns is the gutter (30 units) the retrieval, vision and policy drawings have; six gave the review one of 25.7.
  assert.equal(Math.max(...placed.map((part) => part.wide[0])) + 1, 5)
  assert.equal(Math.max(...placed.map((part) => part.wide[1])) + 1, 3)
})

test('no sideways connector in the narrow layout is a stub: two parts in one row are never next-door neighbours', () => {
  // The narrow grid leaves 21 units between neighbours (84 % of a 133-unit column), which is a 15 px line on a phone and
  // puts the arrow head on the next box. Parts joined along a row have an empty cell between them instead.
  for (const [from, to] of base.edges) {
    const a = cell(from, 'narrow')
    const b = cell(to, 'narrow')
    if (a[1] === b[1]) assert.ok(Math.abs(a[0] - b[0]) >= 2, `${from} -> ${to} is a sideways stub`)
  }
  // The one sideways connector there is: the PR diff hands to GitHub Actions.
  assert.deepEqual(
    base.edges.filter(([from, to]) => cell(from, 'narrow')[1] === cell(to, 'narrow')[1]),
    [['diff', 'actions']],
  )
})
