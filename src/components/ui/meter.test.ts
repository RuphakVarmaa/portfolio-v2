import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { ComponentType } from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

/**
 * The Meter, rendered for real (the same two hooks as the retrieval answer test: `.tsx` is transpiled with the project's own
 * TypeScript, and a `.css` import is an object whose class names are their own names).
 */
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) {
      return { format: 'module', shortCircuit: true, source: 'export default new Proxy({}, { get: (_target, key) => (typeof key === "string" ? key : undefined) })' }
    }
    if (url.endsWith('.tsx')) {
      const file = fileURLToPath(url)
      const out = ts.transpileModule(readFileSync(file, 'utf8'), {
        fileName: file,
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: true },
      })
      return { format: 'module', shortCircuit: true, source: out.outputText }
    }
    return nextLoad(url, context)
  },
})

// A variable URL, so the type-check of the tests (which has no JSX setting) does not try to compile the component.
const meterUrl = new URL('./Meter.tsx', import.meta.url).href
const { Meter } = (await import(meterUrl)) as { Meter: ComponentType<Record<string, unknown>> }

const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(Meter, { label: 'inference p95 (ms)', min: 0, max: 60, ...props }))

test('a meter with a value is a meter: role, range, the value and its words', () => {
  const html = render({ value: 12.34, decimals: 1, unit: 'ms', warn: 30 })
  assert.match(html, /role="meter"/)
  assert.match(html, /aria-valuenow="12\.34"/)
  assert.match(html, /aria-valuemin="0"/)
  assert.match(html, /aria-valuemax="60"/)
  assert.match(html, /aria-valuetext="12\.3 ms"/)
  assert.match(html, />12\.3</, 'the figure is the value')
  assert.doesNotMatch(html, /data-rest/)
  assert.doesNotMatch(html, /no reading yet/)
})

test('a meter that has measured nothing says so: no number, no zero, not a meter reading zero (review round 2)', () => {
  const html = render({ value: null, decimals: 1, unit: 'ms' })
  assert.match(html, /data-rest="true"/, 'CSS switches the needle off the colour of "happening now"')
  assert.match(html, /role="img"/)
  assert.match(html, /aria-label="inference p95 \(ms\): no reading yet"/)
  assert.doesNotMatch(html, /aria-valuenow|aria-valuetext|role="meter"/, 'a meter without a value would be an invalid meter')
  assert.match(html, />—</, 'the figure is a dash')
  assert.doesNotMatch(html, />0\.0</, 'and never a zero it did not measure')
  assert.match(html, /meterDash/, 'the dash is set muted')
})

test('the needle rests at the minimum with no reading, where a reading of the minimum would put it', () => {
  const rotation = (html: string) => /<g transform="rotate\(([-\d.]+) /.exec(html)?.[1]
  assert.equal(rotation(render({ value: null })), rotation(render({ value: 0 })))
  assert.notEqual(rotation(render({ value: 30 })), rotation(render({ value: 0 })))
})

test('the dial is the same size with or without a reading: one structure, one foot (the needle can swing from rest)', () => {
  const tags = (html: string) => [...html.matchAll(/<(div|svg|span|path|g|circle)\b/g)].map((m) => m[1]).join(',')
  assert.equal(tags(render({ value: null })), tags(render({ value: 5 })))
})
