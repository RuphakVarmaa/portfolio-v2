import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projects } from '../../data/portfolio.ts'
import { OG_HEIGHT, OG_WIDTH, fitSize, metricFigure } from './og-card.ts'

test('the card is exactly the size link previews ask for', () => {
  assert.equal(OG_WIDTH, 1200)
  assert.equal(OG_HEIGHT, 630)
})

test('the number under each lamp is the first word of the project\'s headline metric, as the service index prints it', () => {
  assert.deepEqual(
    projects.map((project) => metricFigure(project.headlineMetric)),
    ['87%', '94%', '120ms', '-45%'],
  )
  assert.equal(metricFigure('  42ms   latency '), '42ms')
  assert.equal(metricFigure(''), '')
})

test('text is shrunk in steps of two until it fits, and never grows past the size it was given', () => {
  const width = (size: number) => size * 10
  assert.equal(fitSize(width, 100, 1000), 100, 'already fits')
  assert.equal(fitSize(width, 100, 640), 64)
  assert.equal(fitSize(width, 101, 640), 63, 'odd starting sizes stay odd: steps of two')
  assert.equal(fitSize(() => 5000, 100, 10), 8, 'it stops at a floor rather than looping forever')
})
