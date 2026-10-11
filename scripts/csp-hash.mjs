// Keeps the sha256 of the inline pre-paint script in sync with the Content-Security-Policy meta in index.html.
//
//   pnpm csp:hash          recompute the hash and rewrite the meta (prints the base64 hash)
//   pnpm csp:hash --check  exit 1 if the meta does not match (used by the test suite)
//
// Any edit to the inline <script> in index.html changes its hash; the browser then refuses to run it.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const INDEX_HTML = join(ROOT, 'index.html')

/** Inline classic scripts only: JSON-LD data blocks and external/module scripts are not governed by script-src hashes. */
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)(?![^>]*\btype="(?:application\/ld\+json|module)")[^>]*>([\s\S]*?)<\/script>/g
const CSP_META = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/

export function extractInlineScripts(html) {
  return [...html.matchAll(INLINE_SCRIPT)].map((match) => match[1])
}

/** The CSP source token for a script body: 'sha256-<base64>'. The hash covers the exact text between the tags. */
export function hashToken(content) {
  return `'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`
}

export function readCsp(html) {
  const match = CSP_META.exec(html)
  return match ? match[2] : null
}

/** Replace every 'sha256-...' in script-src with the hashes of the inline scripts that are actually in the page. */
export function withHashes(csp, tokens) {
  return csp.replace(/(script-src\s)([^;]*)/, (_all, head, sources) => {
    const kept = sources.split(/\s+/).filter((source) => source && !source.startsWith("'sha256-"))
    return head + [...kept, ...tokens].join(' ')
  })
}

export function rewriteMeta(html) {
  const tokens = extractInlineScripts(html).map(hashToken)
  const csp = readCsp(html)
  if (csp === null) throw new Error('index.html has no Content-Security-Policy meta tag')
  return { html: html.replace(CSP_META, (_all, a, _b, c) => a + withHashes(csp, tokens) + c), tokens }
}

/** True when every inline script in `html` is allowed by its own CSP meta. */
export function checkHtml(html) {
  const csp = readCsp(html)
  if (csp === null) return { ok: false, problems: ['no Content-Security-Policy meta tag'] }
  const scriptSrc = /script-src\s([^;]*)/.exec(csp)?.[1] ?? ''
  const problems = []
  for (const content of extractInlineScripts(html)) {
    const token = hashToken(content)
    if (!scriptSrc.split(/\s+/).includes(token)) problems.push(`inline script ${token} is not allowed by script-src`)
  }
  return { ok: problems.length === 0, problems }
}

function main() {
  const check = process.argv.includes('--check')
  const html = readFileSync(INDEX_HTML, 'utf8')
  const { html: next, tokens } = rewriteMeta(html)
  for (const token of tokens) console.log(token.slice(1, -1))
  if (check) {
    if (next !== html) {
      console.error('csp-hash: the CSP meta in index.html does not match the inline script. Run "pnpm csp:hash".')
      process.exit(1)
    }
    return
  }
  if (next !== html) {
    writeFileSync(INDEX_HTML, next)
    console.error('csp-hash: index.html updated.')
  } else {
    console.error('csp-hash: index.html already matches.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
