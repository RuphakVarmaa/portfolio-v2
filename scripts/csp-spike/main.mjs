// Runs on the page (governed by the document's meta CSP) and in a same-origin module worker.
const results = { csp: document.querySelector('meta[http-equiv]').content, tests: {}, violations: [] }
window.__results = results
document.addEventListener('securitypolicyviolation', (e) => results.violations.push({ directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample }))

const empty = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])

// 1. Control: on the main thread the policy must block WebAssembly compilation (no 'wasm-unsafe-eval').
try {
  await WebAssembly.compile(empty)
  results.tests.mainThreadWasmCompile = { ok: true, note: 'compiled on the main thread: the CSP does NOT block wasm here' }
} catch (error) {
  results.tests.mainThreadWasmCompile = { ok: false, error: `${error.name}: ${error.message}` }
}

// 2. A same-origin module worker, created under worker-src 'self': compile + ORT session + inference.
const worker = new Worker('/worker.mjs', { type: 'module', name: 'policy-b' })
const workerResult = await new Promise((resolve) => {
  worker.onmessage = (e) => resolve(e.data)
  worker.onerror = (e) => resolve({ error: `worker error event: ${e.message}` })
  setTimeout(() => resolve({ error: 'timeout after 60 s' }), 60000)
})
results.tests.worker = workerResult

// 3. A blob: worker inherits the creator's policy (informative; the site never uses one).
try {
  const blob = new Blob([`try { await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0])); postMessage({ ok: true }) } catch (e) { postMessage({ ok: false, error: e.name + ': ' + e.message }) }`], { type: 'text/javascript' })
  const blobWorker = new Worker(URL.createObjectURL(blob), { type: 'module' })
  results.tests.blobWorker = await new Promise((resolve) => {
    blobWorker.onmessage = (e) => resolve(e.data)
    blobWorker.onerror = (e) => resolve({ error: `worker error event: ${e.message}` })
    setTimeout(() => resolve({ error: 'timeout' }), 5000)
  })
} catch (error) {
  results.tests.blobWorker = { error: `${error.name}: ${error.message}` }
}

results.done = true
document.getElementById('out').textContent = JSON.stringify(results, null, 2)
