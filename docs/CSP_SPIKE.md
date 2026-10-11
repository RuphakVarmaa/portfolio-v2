# CSP spike: does ONNX Runtime need `'wasm-unsafe-eval'`?

Spec 6.3 asked F to load ONNX Runtime (ORT) in an on-origin module worker under the site's meta CSP and add
exactly `'wasm-unsafe-eval'` to `script-src` only if a browser refuses. This is the result.

## Verdict

**Not needed in Chrome. The CSP is unchanged except for the recomputed sha256 of the inline pre-paint
script.** Firefox and Safari were **not tested**: only Google Chrome is available in the build
environment. The spec's Firefox and Safari checks remain open for the owner (instructions below).

## What was tested

| | |
|---|---|
| Date | 2026-10-11 |
| Browser | Google Chrome 154.0.8037.98 (headless, `--headless=new`), macOS arm64 |
| Runtime | `onnxruntime-web` 1.30.0, slim entry `ort.wasm.min.mjs`, `wasmPaths = '/ort/'`, `numThreads = 1`, `executionProviders: ['wasm']` |
| Policy | read from `index.html` at request time, byte for byte: `default-src 'self'; script-src 'self' 'sha256-…'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'; upgrade-insecure-requests` |
| Delivery | a plain static server with **no response headers** (GitHub Pages sets none), so the only policy is the `<meta>` |
| Model | a 117-byte ONNX model built by hand (`c = Add(a, b)`, float `[1,3]`), so no model download is involved |
| Harness | `scripts/csp-spike/` (run it yourself, see below) |

## Results

| Check | Result |
|---|---|
| Main thread: `WebAssembly.compile(...)` | **Blocked**: `CompileError: ... violates the following Content Security policy directive because 'unsafe-eval' is not an allowed source of script`. This control proves the policy is active in this test. |
| Module worker from `/worker.mjs` (`worker-src 'self'`): `WebAssembly.compile(...)` | **Succeeded** |
| Same worker: `import * as ort from onnxruntime-web/wasm`, then `InferenceSession.create(model)` | **Succeeded** in 240 ms (WASM fetched from `/ort/`) |
| Same worker: `session.run({ a: [1,2,3], b: [10,20,30] })` | `[11, 22, 33]`, correct |
| Files the worker fetched (Resource Timing) | `/tiny-add.onnx`, `/ort/ort-wasm-simd-threaded.mjs`, `/ort/ort-wasm-simd-threaded.wasm`: all on-origin, all within `connect-src 'self'` |
| WASM SIMD probe (`SIMD_PROBE_BYTES`, the one `tier.ts` uses) | `WebAssembly.validate` returned `true` |
| `crossOriginIsolated` | `false`, as expected without COOP/COEP; ORT ran single-threaded, no `SharedArrayBuffer` |
| A `blob:` worker compiling WASM | **Blocked**: a `blob:` worker inherits the creating document's policy. The site never uses blob workers for ORT; it must not start to. |

Why it works: a dedicated worker created from an on-origin script URL takes its policy from *that script's
response headers*, not from the page's meta tag. GitHub Pages sends no CSP header, so the worker has no
policy and WASM compilation is allowed. Only `blob:` and `data:` workers inherit the creator's policy.

Also verified with the same harness setup: Vite resolves `onnxruntime-web/wasm` to the slim loader inside a
worker bundle (the `resolve.conditions` entry in `vite.config.ts` takes effect for workers). A worker
that imports it bundles to 48.4 KB raw, **15.4 KB gzipped**, with the 14.24 MB `.wasm` and its loader
left external, fetched from `/ort/` at runtime.

## What this means for S2 and S3

- Create ORT sessions **only inside the on-origin module workers** (`retrieval.worker.ts`, `vision.worker.ts`).
  Never call `WebAssembly.compile` / `InferenceSession.create` on the main thread: it would be blocked.
- Never move a worker to a `blob:` URL.
- `env.wasm.wasmPaths = '/ort/'` (served from `public/ort/`, copied from `node_modules` by `pnpm ort:copy`),
  `env.wasm.numThreads = 1`, `executionProviders: ['wasm']`.

## Not tested: Firefox and Safari (open item)

Run the harness in each browser and read the JSON on the page:

```bash
pnpm install                      # copies public/ort/ via the postinstall step
node scripts/csp-spike/server.mjs # then open http://localhost:4180/
```

Expected in every browser: `mainThreadWasmCompile.ok === false` (control), `worker.ok === true`,
`worker.output` equal to `[11, 22, 33]`.

If a browser reports `worker.ok === false` with a CSP or `CompileError` message, add exactly
`'wasm-unsafe-eval'` to `script-src` in `index.html`, run `pnpm csp:hash`, update the expected policy in
`scripts/csp-hash.test.mjs` (it pins the policy on purpose), and record it here. Nothing else changes: no
new origins, `connect-src 'self'` stays.
