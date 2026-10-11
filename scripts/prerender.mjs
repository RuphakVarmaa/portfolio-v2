// Prerender: turns the Vite output into one real HTML file per route (spec 6.10).
//
// Reads dist/index.html (the Vite client build) as the template and the SSR bundle in dist-ssr/, then:
//   - writes dist/<route>/index.html for every route, with the server-rendered app inside
//     <div id="root" data-prerendered="1" data-route="..."> plus per-route <title>, description,
//     canonical, Open Graph and Twitter tags, the stylesheet link (first thing in the head block, ahead of
//     everything else that is fetched) and preloads for the two latin font files the first screen paints with
//   - writes dist/404.html (the home page; unknown paths boot the SPA from it)
//   - writes dist/profile.json, dist/llms.txt, dist/sitemap.xml from buildAgentFiles
//   - writes dist/build-info.json (chunk sizes, fonts, models, the CSP verbatim) for the Colophon
//   - verifies the CSP: the meta is byte-identical in every page and every inline script is hashed
//   - verifies the phone number appears in none of the agent files nor in the JSON-LD
//   - verifies the LeetCode and certification facts (`highlights`) appear exactly once in dist/index.html
//   - removes dist/.vite/
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { checkHtml, readCsp } from './csp-hash.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const SSR = join(ROOT, 'dist-ssr', 'entry-server.js')

const escapeAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const escapeText = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const gz = (buffer) => gzipSync(buffer, { level: 9 }).length
const fileInfo = (path) => {
  const buffer = readFileSync(join(DIST, path))
  return { file: path, bytes: buffer.length, gzipBytes: gz(buffer) }
}
const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
      )
    : []
const relative = (path) => path.slice(DIST.length + 1)

// ---- inputs ----------------------------------------------------------------------------------------

if (!existsSync(join(DIST, 'index.html'))) throw new Error('prerender: dist/index.html is missing. Run "vite build" first.')
if (!existsSync(SSR)) throw new Error('prerender: dist-ssr/entry-server.js is missing. Run the SSR build first.')

const template = readFileSync(join(DIST, 'index.html'), 'utf8')
const server = await import(pathToFileURL(SSR).href)
const data = await import(pathToFileURL(join(ROOT, 'src', 'data', 'portfolio.ts')).href)

// ---- head ------------------------------------------------------------------------------------------

const HEAD_BLOCK = /<!--head:start-->[\s\S]*?<!--head:end-->/
if (!HEAD_BLOCK.test(template)) throw new Error('prerender: the <!--head:start--> ... <!--head:end--> markers are missing from index.html')

const cssFiles = walk(join(DIST, 'assets')).filter((file) => file.endsWith('.css'))
const cssText = cssFiles.map((file) => readFileSync(file, 'utf8')).join('\n')
// Only the two faces the first screen paints with are preloaded: Big Shoulders (the name, the headings, the numerals) and Atkinson (the lead
// and the body). The stencil, mono and dot-matrix faces are used in small parts further down and arrive with the stylesheet. Five preloads
// (139 KB) queued ahead of the render-blocking stylesheet delayed first paint on a slow link: on Fast 3G the same bytes compete with the CSS.
const FIRST_SCREEN_FONTS = /\/(?:big-shoulders|atkinson-hyperlegible-next)-latin-wght-normal-[^/]*\.woff2$/
const preloadFonts = [
  ...new Set(
    [...cssText.matchAll(/url\((\/assets\/[^)]*-latin-(?:wght|full)-normal-[^)]*\.woff2)\)/g)]
      .map((m) => m[1])
      .filter((href) => FIRST_SCREEN_FONTS.test(href)),
  ),
]

// Vite puts the stylesheet link at the very end of <head>. It is render-blocking, so it moves to the front of the head block: the browser
// asks for it before the font preloads, the favicon-sized things and the module script, and nothing queues ahead of it.
const STYLESHEET = /[ \t]*<link rel="stylesheet"[^>]*>[ \t]*\n?/
const stylesheetLink = STYLESHEET.exec(template)?.[0].trim() ?? ''
if (!stylesheetLink) throw new Error('prerender: the built index.html has no <link rel="stylesheet">')

function headBlock(head) {
  return [
    stylesheetLink,
    `<title>${escapeText(head.title)}</title>`,
    `<meta name="description" content="${escapeAttr(head.description)}" />`,
    `<link rel="canonical" href="${escapeAttr(head.canonical)}" />`,
    ...preloadFonts.map((href) => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin />`),
    `<meta property="og:type" content="${head.ogType}" />`,
    `<meta property="og:site_name" content="${escapeAttr(head.siteName)}" />`,
    `<meta property="og:title" content="${escapeAttr(head.ogTitle)}" />`,
    `<meta property="og:description" content="${escapeAttr(head.ogDescription)}" />`,
    `<meta property="og:url" content="${escapeAttr(head.ogUrl)}" />`,
    `<meta property="og:image" content="${escapeAttr(head.ogImage)}" />`,
    `<meta property="og:image:width" content="${head.ogImageWidth}" />`,
    `<meta property="og:image:height" content="${head.ogImageHeight}" />`,
    // X reads og:title, og:description and og:image when the twitter:* ones are absent, so only the card type is needed.
    `<meta name="twitter:card" content="${head.twitterCard}" />`,
  ]
    .map((line) => `    ${line}`)
    .join('\n')
}

// ---- pages -----------------------------------------------------------------------------------------

const ROOT_DIV = '<div id="root"></div>'
if (!template.includes(ROOT_DIV)) throw new Error('prerender: <div id="root"></div> is missing from the built index.html')

const pages = new Map()
for (const route of server.ROUTES) {
  const { html, head } = server.render(route.match)
  const page = template
    .replace(STYLESHEET, '')
    .replace(HEAD_BLOCK, `<!--head:start-->\n${headBlock(head)}\n    <!--head:end-->`)
    .replace(ROOT_DIV, `<div id="root" data-prerendered="1" data-route="${route.key}">${html}</div>`)
  pages.set(route.file, page)
}

// The head order is part of the first-paint budget (docs/INTERFACES.md deviation 20): the render-blocking stylesheet is requested before
// anything else that is fetched, and only the two first-screen fonts are preloaded. Fail the build rather than let it drift back.
for (const [file, page] of pages) {
  const head = page.slice(0, page.indexOf('</head>'))
  const sheet = head.indexOf('<link rel="stylesheet"')
  const firstFetch = Math.min(...['<link rel="preload"', '<script type="module"', '<link rel="modulepreload"'].map((tag) => (head.indexOf(tag) < 0 ? Infinity : head.indexOf(tag))))
  if (sheet < 0 || sheet > firstFetch) throw new Error(`prerender: ${file}: the stylesheet link must come before every preload and script in the head`)
  const fontPreloads = (head.match(/<link rel="preload"[^>]*as="font"/g) ?? []).length
  if (fontPreloads > 2) throw new Error(`prerender: ${file}: ${fontPreloads} font preloads (only the two first-screen faces are preloaded)`)
}

const csp = readCsp(template)
if (csp === null) throw new Error('prerender: the built index.html lost its Content-Security-Policy meta')

for (const [file, page] of pages) {
  // The meta must be copied byte for byte into every page, and every inline script must be hashed in it.
  if (readCsp(page) !== csp) throw new Error(`prerender: ${file} does not carry the same CSP as index.html`)
  const result = checkHtml(page)
  if (!result.ok) throw new Error(`prerender: ${file}: ${result.problems.join('; ')}`)
  const target = join(DIST, file)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, page)
}
// Unknown deep links on GitHub Pages get 404.html; it carries the home page and boots the SPA (main.tsx
// notices the route does not match data-route and renders from scratch).
await writeFile(join(DIST, '404.html'), pages.get('index.html'))

// ---- build info ------------------------------------------------------------------------------------

const manifest = existsSync(join(DIST, '.vite', 'manifest.json')) ? JSON.parse(readFileSync(join(DIST, '.vite', 'manifest.json'), 'utf8')) : {}
const assetFiles = walk(join(DIST, 'assets')).map(relative)
const byFile = new Map(Object.values(manifest).map((entry) => [entry.file, entry]))
const nameOf = (file) => file.replace(/^assets\//, '').replace(/-[A-Za-z0-9_-]{8}\.(?:js|css)$/, '')

// Everything the entry imports statically (React lives in its own chunk) loads before the page is interactive.
const initialFiles = new Set()
const visit = (key) => {
  const entry = manifest[key]
  if (!entry || initialFiles.has(entry.file)) return
  initialFiles.add(entry.file)
  for (const imported of entry.imports ?? []) visit(imported)
}
for (const [key, entry] of Object.entries(manifest)) if (entry.isEntry) visit(key)

const js = assetFiles
  .filter((file) => file.endsWith('.js'))
  .map((file) => {
    const entry = byFile.get(file)
    const worker = /\.worker-/.test(file)
    return {
      ...fileInfo(file),
      kind: worker ? 'worker' : entry?.isEntry ? 'entry' : 'chunk',
      name: nameOf(file),
      initial: initialFiles.has(file),
    }
  })
  .sort((a, b) => b.gzipBytes - a.gzipBytes)

const fonts = assetFiles
  .filter((file) => file.endsWith('.woff2'))
  .map((file) => {
    const match = /^assets\/(.+?)-(latin-ext|latin|cyrillic-ext|cyrillic|vietnamese|greek-ext|greek)-[a-z]+-normal-[\w-]+\.woff2$/.exec(file)
    const info = fileInfo(file)
    return { ...info, gzipBytes: info.bytes, family: match?.[1] ?? nameOf(file), subset: match?.[2] ?? 'unknown' }
  })

const optional = [
  ['ort/ort-wasm-simd-threaded.wasm', 'ONNX Runtime WASM (SIMD build)'],
  ['ort/ort-wasm-simd-threaded.mjs', 'ONNX Runtime loader'],
  ['models/minilm/model_quantized.onnx', 'all-MiniLM-L6-v2 encoder (int8)'],
  ['models/yolov8n/yolov8n-320.onnx', 'YOLOv8n detector (320 px)'],
  ['traces/vision.json', 'Recorded vision run'],
  ['media/desk.mp4', 'Recorded clip (4 s)'],
  ['retrieval/corpus.json', 'Retrieval corpus'],
  ['retrieval/embeddings.json', 'Chunk embeddings'],
]
const assets = optional.map(([path, label]) => {
  const present = existsSync(join(DIST, path))
  return { path, label, bytes: present ? statSync(join(DIST, path)).size : 0, present }
})

/**
 * The commit the Colophon names as the build's. In CI that is the commit the workflow checked out (GITHUB_SHA, shortened the way
 * `git rev-parse --short` shortens it). Anywhere else it is HEAD, with `-dirty` when the working tree differs from it: a build of
 * uncommitted work used to print the last commit's hash as if that were what was built.
 */
const gitCommit = () => {
  const run = (...args) => execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  try {
    const sha = process.env.GITHUB_SHA?.trim()
    if (sha && /^[0-9a-f]{7,40}$/i.test(sha)) return sha.slice(0, 7).toLowerCase()
    const head = run('rev-parse', '--short', 'HEAD')
    if (!head) return null
    return run('status', '--porcelain').length > 0 ? `${head}-dirty` : head
  } catch {
    return null
  }
}
const commit = gitCommit()
const builtAt = new Date(process.env.SOURCE_DATE_EPOCH ? Number(process.env.SOURCE_DATE_EPOCH) * 1000 : Date.now()).toISOString()

const buildInfo = {
  version: 'v3.0',
  builtAt,
  commit,
  html: { file: 'index.html', bytes: Buffer.byteLength(pages.get('index.html')), gzipBytes: gz(Buffer.from(pages.get('index.html'))) },
  css: assetFiles.filter((file) => file.endsWith('.css')).map(fileInfo),
  js,
  fonts,
  assets,
  csp,
  routes: server.ROUTES.map((route) => route.path),
}

// ---- agent files -----------------------------------------------------------------------------------

const { profileJson, llmsTxt, sitemapXml } = server.buildAgentFiles(buildInfo)
await writeFile(join(DIST, 'profile.json'), profileJson)
await writeFile(join(DIST, 'llms.txt'), llmsTxt)
await writeFile(join(DIST, 'sitemap.xml'), sitemapXml)
await writeFile(join(DIST, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n')

// The phone number is shown on the page but must never reach the agent files or the JSON-LD (owner decision).
const phone = data.profile.phone
const digits = phone.replace(/\D/g, '')
const phoneForms = [phone, phone.replaceAll(' ', ''), digits, `+${digits}`]
const jsonLd = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(template)?.[1] ?? ''
for (const [name, text] of [['profile.json', profileJson], ['llms.txt', llmsTxt], ['sitemap.xml', sitemapXml], ['JSON-LD', jsonLd]]) {
  if (phoneForms.some((form) => text.includes(form))) throw new Error(`prerender: the phone number leaked into ${name}`)
}

// Facts the site states once must be on the page once (spec 3.5 and the Definition of Done): the LeetCode count and
// rating and the two certifications live in the Deploy History ledger and nowhere else on `/`. Counting them here
// keeps that from regressing. (`highlights` holds exactly those four facts.)
const home = pages.get('index.html')
for (const { value } of data.highlights) {
  const count = [...home.matchAll(new RegExp(`(?<![\\w.-])${value.replace(/[+]/g, '\\+')}(?![\\w-])`, 'g'))].length
  if (count !== 1) throw new Error(`prerender: "${value}" appears ${count} times in dist/index.html (the spec says exactly once)`)
}

rmSync(join(DIST, '.vite'), { recursive: true, force: true })
console.log(
  `prerender: ${pages.size} pages + 404.html, profile.json, llms.txt, sitemap.xml, build-info.json (html ${buildInfo.html.bytes} B, ${preloadFonts.length} font preloads)`,
)
