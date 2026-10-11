import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { INDEX_HTML, checkHtml, extractInlineScripts, hashToken, readCsp, rewriteMeta } from './csp-hash.mjs'

const html = readFileSync(INDEX_HTML, 'utf8')

test('index.html has exactly one inline script (the pre-paint IIFE) and the CSP meta already matches its hash', () => {
  const scripts = extractInlineScripts(html)
  assert.equal(scripts.length, 1)
  assert.match(scripts[0], /ruphak-theme/)
  assert.equal(rewriteMeta(html).html, html, 'run "pnpm csp:hash" after editing the inline script')
  assert.deepEqual(checkHtml(html), { ok: true, problems: [] })
})

test('the CSP is the spec policy: the only change from v2 is the recomputed hash', () => {
  const csp = readCsp(html)
  const token = hashToken(extractInlineScripts(html)[0])
  assert.equal(
    csp,
    `default-src 'self'; script-src 'self' ${token}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'; upgrade-insecure-requests`,
  )
})

test('editing the inline script without re-hashing is caught', () => {
  const tampered = html.replace('ruphak-theme', 'ruphak-theme-x')
  assert.equal(checkHtml(tampered).ok, false)
  assert.equal(checkHtml(rewriteMeta(tampered).html).ok, true)
})

test('the pre-paint script handles every state hook the CSS and the preference store rely on', () => {
  const script = extractInlineScripts(html)[0]
  for (const hook of ['dataset.theme', 'dataset.motion', 'dataset.machine', 'dataset.plain', 'dataset.js']) {
    assert.ok(script.includes(hook), `pre-paint script never sets ${hook}`)
  }
  // The v2 rule that forced lite motion on small screens is gone: phones are the richest tier now.
  assert.ok(!script.includes('max-width'), 'no width-based motion rule')
})
