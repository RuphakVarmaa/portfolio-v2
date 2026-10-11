// Same-origin module worker, as the site's workers are. No CSP header comes with this file (GitHub Pages
// sets none), so the document's meta CSP does not govern it. We verify that is what the browser does.
import * as ort from '/ort-runtime/ort.wasm.min.mjs'

const out = { name: self.name }
try {
  out.workerWasmCompile = await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])).then(() => ({ ok: true }), (e) => ({ ok: false, error: `${e.name}: ${e.message}` }))
  out.simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 22, 1, 20, 0, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 11]))
  ort.env.wasm.wasmPaths = '/ort/'
  ort.env.wasm.numThreads = 1
  out.crossOriginIsolated = self.crossOriginIsolated
  const t0 = performance.now()
  const model = new Uint8Array(await (await fetch('/tiny-add.onnx')).arrayBuffer())
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] })
  out.sessionCreateMs = Math.round(performance.now() - t0)
  const feeds = { a: new ort.Tensor('float32', Float32Array.from([1, 2, 3]), [1, 3]), b: new ort.Tensor('float32', Float32Array.from([10, 20, 30]), [1, 3]) }
  const result = await session.run(feeds)
  out.output = Array.from(result.c.data)
  out.ok = JSON.stringify(out.output) === JSON.stringify([11, 22, 33])
  out.ortVersion = ort.env.versions?.common
  out.loadedFrom = performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname)
} catch (error) {
  out.ok = false
  out.error = `${error?.name}: ${error?.message}`
}
postMessage(out)
