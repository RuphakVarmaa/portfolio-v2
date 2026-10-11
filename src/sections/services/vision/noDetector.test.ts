import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copy } from '../../../data/copy.ts'
import { projects } from '../../../data/portfolio.ts'
import { noDetector, panelCopy } from './noDetector.ts'
import { EMPTY_PANEL, type DetectorKnown } from './panel-store.ts'

const base = copy.services.vision

test('before the build is known (and in the prerendered HTML) the panel promises no detection', () => {
  assert.equal(EMPTY_PANEL.detector, 'unknown')
  assert.equal(panelCopy(base, EMPTY_PANEL.detector).caption, noDetector.caption)
})

test('with no detector published the always-visible caption and the plain caption say nothing is detected', () => {
  for (const known of ['unknown', 'absent'] as const satisfies readonly DetectorKnown[]) {
    const shown = panelCopy(base, known)
    assert.equal(shown.caption, noDetector.caption)
    assert.equal(shown.plain, noDetector.plain)
    assert.match(shown.caption, /not published on this site yet/)
    assert.match(shown.caption, /nothing is detected/)
    assert.doesNotMatch(shown.caption, /runs single-threaded in WebAssembly here/, 'the claim finding R1 was raised against')
    assert.match(shown.plain, /not published yet, so no boxes appear/)
    assert.doesNotMatch(shown.plain, /draws a box around each object it recognises/)
    // Everything else on the panel is the foundation's copy, untouched.
    assert.equal(shown.depth, base.depth)
    assert.equal(shown.trace, base.trace)
    assert.equal(shown.stamp, base.stamp)
    assert.equal(shown.demo, base.demo)
  }
})

test('the production claim is never rewritten by the no-detector wording', () => {
  assert.match(noDetector.caption, /fine-tuned YOLOv8 at <30 ms/)
  assert.match(noDetector.caption, /Your numbers are your device's numbers\./)
})

test('a published detector keeps the foundation copy exactly as written', () => {
  assert.equal(panelCopy(base, 'published'), base)
})

test('the camera dialog without a detector keeps the privacy promises and says nothing is recognised', () => {
  assert.match(noDetector.consent, /no detector is loaded, so nothing is recognised/)
  assert.match(noDetector.consent, /never leave your device/)
  assert.match(noDetector.consent, /nothing is uploaded or stored/)
  assert.match(noDetector.consent, /stops when you scroll away or press Stop/)
  assert.doesNotMatch(noDetector.consent, /runs YOLOv8n/)
})

test('no invented numbers: the only figure in the no-detector wording is the production one, from the data', () => {
  const figures = (text: string) => text.match(/(?<![A-Za-z0-9]|\d[.,])\d[\d,.]*\d(?![A-Za-z])|(?<![A-Za-z0-9]|\d[.,])\d(?![A-Za-z0-9])/g) ?? []
  const fromData = projects[1].metrics.flatMap((metric) => `${metric.value} ${metric.label}`.match(/\d[\d,.]*\d|\d/g) ?? [])
  for (const [name, text] of Object.entries(noDetector)) {
    for (const figure of figures(text)) assert.ok(fromData.includes(figure), `${name}: "${figure}" is not in the vision project's data`)
  }
})
