// CSP spike server (spec 6.3). Serves this directory, /ort/ from the repo's public/ort/ (the files the site
// serves), and the slim ORT entry from node_modules. The page's CSP is read from the repo's index.html at
// request time, so it is byte-identical to production.
//
//   node scripts/csp-spike/server.mjs         then open http://localhost:4180/ in any browser
//
// (tiny-add.onnx, a 117-byte hand-built Add model, is generated on first start; see make-model.mjs.)
//
// The page prints a JSON report: main-thread WebAssembly.compile must FAIL (the policy is active), the
// on-origin module worker must compile, create an ORT session and add two vectors.
import { createServer } from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildModel } from './make-model.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
if (!existsSync(join(HERE, 'tiny-add.onnx'))) writeFileSync(join(HERE, 'tiny-add.onnx'), buildModel())
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' }

// The page's CSP is read from the repo's index.html at request time so it is byte-identical to production.
const indexHtml = readFileSync(join(REPO, 'index.html'), 'utf8')
const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(indexHtml)[1]

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  let file
  if (url.pathname === '/') {
    const page = readFileSync(join(HERE, 'index.html'), 'utf8').replace('__CSP__', csp)
    res.writeHead(200, { 'content-type': 'text/html' })
    return res.end(page)
  }
  if (url.pathname.startsWith('/ort/')) file = join(REPO, 'public', url.pathname)
  else if (url.pathname.startsWith('/ort-runtime/')) file = join(REPO, 'node_modules/onnxruntime-web/dist', url.pathname.replace('/ort-runtime/', ''))
  else file = join(HERE, url.pathname)
  if (!existsSync(file)) { res.writeHead(404); return res.end('not found') }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
}).listen(4180, () => console.log('csp spike server on :4180; CSP =', csp))
