import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { copy } from '../data/copy.ts'
import { profile, projects } from '../data/portfolio.ts'
import { OG_IMAGE_URL, ROUTES } from '../routes.ts'

const png = readFileSync(new URL('../../public/og.png', import.meta.url))
const source = readFileSync(new URL('../../docs/og.html', import.meta.url), 'utf8')

test('public/og.png is a real PNG, exactly 1200 x 630', () => {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG signature')
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR')
  assert.equal(png.readUInt32BE(16), 1200, 'width')
  assert.equal(png.readUInt32BE(20), 630, 'height')
})

test('every route points its og:image and twitter image at that file', () => {
  assert.equal(OG_IMAGE_URL, 'https://www.ruphak.me/og.png')
  for (const route of ROUTES) assert.equal(route.og.image, OG_IMAGE_URL, route.key)
})

test('the card source carries the name, the tagline and the four headline numbers from the data, not retyped ones', () => {
  assert.ok(source.includes(profile.name.split(' ')[0].toUpperCase()))
  assert.ok(source.includes(copy.controlRoom.h1))
  for (const project of projects) {
    const number = project.headlineMetric.split(' ')[0]
    assert.ok(source.includes(`>${number}</text>`), `${project.title}: ${number}`)
  }
  for (const name of Object.values(copy.controlRoom.board.shortNames)) assert.ok(source.includes(name), name)
  assert.ok(source.includes('viewBox="0 0 1200 630"'))
})

test('the card is hand-built SVG: no raster images, no external requests other than the self-hosted fonts', () => {
  assert.ok(!/<img\b/i.test(source))
  assert.ok(!/https?:\/\//.test(source.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '')), 'no absolute URLs except the SVG namespace')
  for (const match of source.matchAll(/url\('([^']+)'\)/g)) assert.match(match[1], /^\.\.\/node_modules\/@fontsource-variable\//)
})
