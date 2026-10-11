import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/*
 * Regression guard for review finding C1: printing /resume/ gave a blank first page (3 A4 sheets instead of 2).
 * Cause: a named page (`@page resume` + `page: resume` on <main>). A page name that differs from the one in force
 * before it forces a page break, and the two visually hidden live-region <div>s that come before <main> sit on the
 * default page, so the break landed before the résumé and the first sheet was empty. The fix is one unnamed
 * `@page` rule. This is checked on the stylesheet source, because a real print needs a browser; the page count was
 * verified with Chrome's Page.printToPDF (2 pages, with and without JavaScript).
 */

const SRC = fileURLToPath(new URL('..', import.meta.url))

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return cssFiles(path)
    return entry.name.endsWith('.css') ? [path] : []
  })
}

/** The stylesheet without its comments (the comments here explain the very rule they forbid). */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

const sheets = cssFiles(SRC).map((path) => ({ path: path.slice(SRC.length), css: stripComments(readFileSync(path, 'utf8')) }))
const print = sheets.find((sheet) => sheet.path === 'styles/print.css')

test('the stylesheets are found (the guard is not passing for lack of input)', () => {
  assert.ok(sheets.length > 10, `${sheets.length} stylesheets under src/`)
  assert.ok(print, 'src/styles/print.css')
})

test('no stylesheet assigns a named page: no `page:` property and no `@page <name>` rule', () => {
  for (const { path, css } of sheets) {
    assert.doesNotMatch(css, /(?<![\w-])page\s*:/, `${path}: a \`page\` declaration forces a page break between differently named pages`)
    assert.doesNotMatch(css, /@page\s+[A-Za-z_][\w-]*\s*\{/, `${path}: a named @page rule`)
  }
})

test('print.css sets A4 and the margins with one unnamed @page rule inside @media print', () => {
  assert.ok(print)
  const rules = [...print.css.matchAll(/@page\b[^{]*\{([^}]*)\}/g)]
  assert.equal(rules.length, 1, 'exactly one @page rule')
  assert.match(rules[0][1], /size:\s*A4\s*;/)
  assert.match(rules[0][1], /margin:\s*12mm 14mm 14mm\s*;/)
  assert.match(print.css, /@media\s+print\s*\{\s*@page\s*\{/, 'the rule sits first inside `@media print`, so it is a no-op on screen')
})

test('the résumé page still marks its <main> for the print link rules, and imports print.css', () => {
  const page = readFileSync(join(SRC, 'pages', 'ResumePage.tsx'), 'utf8')
  assert.match(page, /import ['"]\.\.\/styles\/print\.css['"]/)
  assert.match(page, /data-resume=""/)
})
