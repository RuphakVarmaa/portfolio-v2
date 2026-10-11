// The production class names are a counter (scripts/class-names.ts). These tests pin what the build relies on:
// the table is complete, deterministic and collision-free, so the server markup and the stylesheet always agree.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildClassTable, classNamesIn, counterNames, moduleCssFiles, posixRelative } from './class-names.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('the counter gives 936 two-character names, then three-character ones, all unique and valid class names', () => {
  const names = counterNames()
  const first = Array.from({ length: 936 }, () => names.next().value)
  assert.deepEqual(first.slice(0, 3), ['aa', 'ab', 'ac'])
  assert.equal(first[35], 'a9')
  assert.equal(first[36], 'ba')
  assert.equal(first[935], 'z9')
  assert.ok(first.every((name) => name.length === 2))
  const after = names.next().value
  assert.equal(after, 'aaa')
  const some = [...first, after, ...Array.from({ length: 2000 }, () => names.next().value)]
  assert.equal(new Set(some).size, some.length, 'no name is handed out twice')
  assert.ok(some.every((name) => /^[a-z][a-z0-9]*$/.test(name)), 'every name starts with a letter')
})

test('classNamesIn reads class and keyframe names once each and skips numbers, domains, file names and comments', () => {
  const css = `
    /* .commented-out { } */
    .card, .card:hover > .card-title { margin: 0.5rem; width: 1.5em }
    @keyframes pulse-ring { to { opacity: 0 } }
    .icon { mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E"); background: url(font.woff2) }
    .a-b_c9 .-dash { color: red }
  `
  assert.deepEqual(classNamesIn(css), ['card', 'card-title', 'icon', 'a-b_c9', '-dash', 'pulse-ring'])
})

test('the table covers every class of every module, once, and is the same every time it is built', () => {
  const table = buildClassTable(ROOT)
  const again = buildClassTable(ROOT)
  assert.deepEqual([...table], [...again], 'deterministic: the client build and the SSR build must agree')
  const files = moduleCssFiles(join(ROOT, 'src'))
  assert.ok(files.length >= 15, 'the section and shell modules were found')
  let expected = 0
  for (const file of files) {
    const key = posixRelative(ROOT, file)
    for (const name of classNamesIn(readFileSync(file, 'utf8'))) {
      expected += 1
      assert.ok(table.has(`${key}:${name}`), `${key} .${name} has a short name`)
    }
  }
  assert.equal(table.size, expected)
  const values = [...table.values()]
  assert.equal(new Set(values).size, values.length, 'every class has a name of its own across all modules')
})

test('no short name collides with a global class from the plain stylesheets (.wrap, .stencil, .sr-only ...)', () => {
  const table = buildClassTable(ROOT)
  const short = new Set(table.values())
  const stylesDir = join(ROOT, 'src', 'styles')
  const global = readdirSync(stylesDir)
    .filter((name) => name.endsWith('.css'))
    .flatMap((name) => classNamesIn(readFileSync(join(stylesDir, name), 'utf8')))
  assert.ok(global.includes('wrap') && global.includes('stencil'), 'the global utility classes were found')
  for (const name of global) assert.ok(!short.has(name), `the global class .${name} is also a short module class name`)
})
