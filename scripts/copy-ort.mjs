// Copies the ONNX Runtime Web WASM binary and its loader from node_modules into public/ort/, so they are
// served from this origin (the CSP has no external origins). Runs as `postinstall`, and again at the start
// of `dev` and `build`. Idempotent: files that are already identical in size are left alone.
// public/ort/ is generated and git-ignored.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules', 'onnxruntime-web', 'dist')
const target = join(root, 'public', 'ort')
// onnxruntime-web 1.30 ships one WASM build: the SIMD one (about 14.24 MB). The slim JS entry is bundled by Vite.
const FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']

if (!existsSync(source)) {
  console.error(`copy-ort: ${source} not found. Run "pnpm install" first.`)
  process.exit(1)
}

mkdirSync(target, { recursive: true })
for (const name of FILES) {
  const from = join(source, name)
  const to = join(target, name)
  if (!existsSync(from)) {
    console.error(`copy-ort: ${from} is missing from the installed onnxruntime-web.`)
    process.exit(1)
  }
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue
  copyFileSync(from, to)
  console.log(`copy-ort: ${name} -> public/ort/ (${(statSync(from).size / 1e6).toFixed(2)} MB)`)
}
