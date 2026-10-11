# INTERFACES: what F ships and S1 to S6 consume

This is the contract between the foundation (F) and the six parallel section workstreams. It lists the
exact exported names, signatures and props, with short examples. Where it and `REDESIGN_SPEC.md` differ,
**this file wins** (every difference is listed in section 10, "Deviations and SPEC-GAPs"). Where this file
is silent, choose the option that keeps the page honest, static, accessible and small, and leave a
`// SPEC-GAP:` comment.

The TypeScript recipes in this file were type-checked against the real modules (the CSS snippet and the signature lists are descriptions).

Contents: 1 Ground rules · 2 Owner overrides · 3 Conventions · 4 Budgets · 5 Global hooks (CSS and DOM) ·
6 Cluster API · 7 Draw, motion, data, routes · 8 UI components and shell · 9 Per-workstream notes ·
10 Deviations and SPEC-GAPs · 11 Commands

---

## 1. Ground rules

- **Ownership.** Touch only the files your workstream owns (spec section 7). The `index.tsx`, worker,
  page, `agent-files.ts` and script placeholders F created are yours from the first line: replace them
  completely. Never edit an F file. If you need a change in one, leave `// SPEC-GAP: <what and why>` in
  your own file and put it in your PR description; F's owner decides.
- **`pnpm check` must stay green** (lint, tests, build, prerender, budgets). Run it before you hand over.
- **Nothing is simulated.** Anything shown as measured, live or "just now" must be measured in the browser
  by code that ran. No hard-coded results. No fabricated traces, participants, quotes or numbers.
- **Facts come from `src/data/portfolio.ts`.** Never retype a metric, date, role, skill or title; read it.
  Prose comes from `src/data/copy.ts`. A test (`src/data/copy.test.ts`) rejects any number in the prose
  that is not in the data or one the spec introduces.
- **No generated imagery. No external origins. No gradients. No emoji.**

## 2. Owner overrides (these beat the spec)

1. **The phone number is visible.** S6's Contact renders `profile.phone` when `profile.publishPhone` is
   true (it is, by default), as a `tel:` link next to email, LinkedIn and GitHub. It stays **out** of
   `profile.json`, `llms.txt` and the JSON-LD (the prerender fails the build if it leaks into them;
   `buildAgentFiles` uses an allow-list of profile fields). Ignore the spec's "no phone anywhere in dist".
2. **Agents cannot run user tests.** `docs/USER_TESTS.md` (S1) is a clearly labelled TEMPLATE and
   checklist for the owner to fill in. Never invent participants, quotes or results. `docs/style-frame.html`
   (S1) is still produced. Nothing blocks on user tests.
3. **No model files, media or traces are downloaded.** The site must work honestly without them: BM25
   retrieval; the vision panel says the detector is not published yet but still demonstrates the ring
   buffer and backpressure (camera or motion producer where feasible). Leave READMEs that explain how the
   owner adds `model_quantized.onnx`, `vocab.txt`, `yolov8n-320.onnx`, the clip and traces.
4. **Facts stay identical** to `portfolio.ts`; copy can be rewritten.
5. **No `git push`, no deploy, no change to `.github` triggers.**
6. **Honesty:** "measured" and "live" must be measured in the browser.

## 3. Conventions

### Imports and TypeScript

- Every relative import carries its extension: `import { x } from './x.ts'`, `'./Y.tsx'`, `'./z.module.css'`.
  Node runs tests and scripts directly under type stripping and does no extension probing. The local lint
  rule `local/relative-import-extension` enforces it everywhere in `src/` and `scripts/`.
- Type-only imports use `import type { ... }` (`verbatimModuleSyntax` is on).
- Erasable syntax only (`erasableSyntaxOnly`): no `enum`, no `namespace`, no constructor parameter
  properties. Use `as const` objects and union types.
- Modules reachable from a `*.test.ts` or from `scripts/` must be plain `.ts` (no JSX) and must not touch
  `window`, `document` or `import.meta.env` at import time. Keep logic in `.ts` files and the React shell in
  `.tsx` files. Tests live next to the code (`foo.test.ts`) and run with `node --test` (no test framework).
- Timers: type a timer handle as `ReturnType<typeof setTimeout>`; do not annotate it `number`.
- `react-hooks` v7 lint is on (it includes the React Compiler rules): no `setState` directly in an effect
  body, no reading or writing refs during render, no impure calls (`Date.now()`, `Math.random()`) during
  render. Derive state in render, subscribe with `useSyncExternalStore`, and set state from callbacks.

### Server-side rendering is the default

The home page and every route are **prerendered with `renderToString`** (`scripts/prerender.mjs`) and then
hydrated. So:

- Nothing may touch `window`, `document`, `localStorage`, `matchMedia`, `navigator` at module scope or
  during render. Do it in effects, or through the hooks below, which return a deterministic server snapshot.
- The first client render must equal the server render. Use `useClusterState`, `useQuorum`,
  `useTelemetry`, `usePreferences`, `useTierInfo`: during hydration React uses their server snapshots
  (empty cluster, term 0, tier `full`, default preferences) and re-renders immediately after with the real
  values. Never read `Date.now()`, `performance.now()` or storage to decide what to render first.
- Text that is **measured** on the client (the boot line, readouts) renders its prerendered placeholder
  first. Example for the boot line (S1):

  ```tsx
  const t = useTelemetry()
  const q = useQuorum()
  const started = t.fcp !== null || Object.keys(t.workers).length > 0
  const text = started ? buildBootLine({ fcp: t.fcp, workers: t.workers, nodes: q.nodes, term: q.term }) : copy.controlRoom.boot.prerendered
  ```
- Dialogs (`<dialog>`), menus and sheets render their **content only while open**, so it stays out of the
  prerendered HTML (see Header, KeySheet, Schematic for the pattern).
- Static schematics, captions, fallbacks and every fact must be in the prerendered DOM; JavaScript only adds
  behaviour. Controls that do nothing without JS carry `data-js-only` (hidden when `html[data-js]` is absent).

### CSS

- CSS Modules (`Foo.module.css`), plain CSS: **no nesting, no `:has()`, no `light-dark()`** (browser floor:
  Safari 16.4, Firefox 120). Container queries, `color-mix()`, `aspect-ratio`, `inset`, `clamp()`, `dvh`
  are fine. Production class names are shortened to `q` + 6 characters (a size budget, see section 4).
- Colours and sizes come from the tokens in `src/styles/tokens.css`. Muted text (`--ink-muted`) is for
  `--paper` and `--paper-2` only (7.98:1 and 7.23:1); never put it on `--paper-3` (6.39:1, a hover/pressed
  fill). `--live` (vermilion) means *happening
  now* (heartbeat, pulled plug, deny, needle, lit lamp) and carries text **only at 18 px or larger**
  (`--live-text` for that text). `--cobalt` means connection and allow. Body text is `--ink` or
  `--ink-muted`. `--lamp-off` is the only grey. No other greys, no gradients (the lamp glow is the only
  exception and is drawn in SVG with hard stops), no grain, no blur, no translucency.
- Breakpoints (literal, custom properties cannot be used in media queries): `640px`, `900px` (header),
  `1024px` (12-column grid). Container query for schematics: `600px`.
- Touch targets are 44x44 px or larger. Severity and allow/deny are shape plus text, never colour alone.
- Under `forced-colors: active` keep outlines with `outline`, not `box-shadow`, and keep pressed, selected and
  active states visible with a border or outline (F's shell and UI components already do; see the tail of
  `shell.module.css` and `ui.module.css`). Under `prefers-contrast: more` the tokens do the work (muted text
  becomes full ink, hairlines get darker, `--stroke-draw` grows to 2.25 px), so use the tokens and never a literal
  colour or stroke width.
- Motion uses `--dur-1/2/3`, `--dur-boot` and `--ease-*`, which are `0ms` under lite motion, so a
  transition written with the tokens is automatically instant. Nothing moves unless a real event happened.
- Global utility classes (from `src/styles/utilities.css`): `.sr-only`, `.wrap`, `.grid` (+ `--cols` 4/6/12),
  `.span-full`, `.span-4`, `.span-6`, `.span-12`, `.span-md-4/5/6/7/8` (from 1024 px), `.stencil`, `.mono`,
  `.lead`, `.muted`, `.measure`, `.panel`, `.ruled`, `.keycap`, `.tabular`.

### Accessibility

- One `<h1>` per route. Home: the hero (S1). `Section` renders an `h2`; `ServicePanel` renders an `h3`
  inside the Services section and the page `h1` on `/projects/*`. Never skip a level.
- Use native elements (`button`, `a`, `select`, `input`, `textarea`, `dialog`, `details`).
- Every panel carries a `PlainCaption`. The honest caption of a service is always visible.
- Announce through `announce()` only (section 6.8). F already announces: each worker pool becoming ready,
  every scheduler `lastEvent` sentence (unplugged, retried and recovered, failed), and leader changes.
  Do not announce those again. You announce: fuzz complete (S4), email copied (S6), stamp earned (S5),
  your own results.

## 4. Budgets (enforced by `scripts/check-budgets.mjs`)

Measured on 2026-10-11 with F's placeholders (KB = 1000 bytes). The script prints the real numbers on every
build and fails on a breach. Lighthouse (mobile, default throttling, headless Chrome 154, `vite preview`) on the
F baseline: Performance 98, Accessibility 100, Best Practices 100, SEO 100 (FCP 1.3 s, LCP 2.4 s simulated,
TBT 50 ms, CLS 0.002). axe-core 4.10: 0 violations on every route in both themes.

| Item | Limit | F baseline | Guidance |
|---|---|---|---|
| `dist/index.html` raw | 60 KB | 45.3 KB | Net additions across S1, S5, S6 together: about 22 KB when you replace the placeholders. Suggested: S1 hero + board 10 KB total, S5 chaos lab 3 KB, S6 four sections 8 KB. Keep SVG path data small: reuse shapes with `<use>` or CSS masks, round to 2 decimals (`fmt`), avoid per-element inline `style`. |
| All CSS, gzip | 24 KB | 12.8 KB | About 1.5 KB gzip per section module; S1 3 KB. |
| Initial JS, site entry `index-*.js`, gzip | 95 KB | 36.5 KB | |
| Initial JS, React vendor chunk, gzip | 62 KB | 59.0 KB | React 19.2.8 DOM alone. Never import `react-dom` anything else. |
| Initial JS, total, gzip | 125 KB | 95.5 KB | About 30 KB for everyone. Suggested: S1 10, S6 8, S5 3, S2/S3/S4 2 each (their `index.tsx` only). **Heavy code goes behind `DemoSlot` / `import()`.** |
| Lazy chunk or worker script, gzip (each) | 35 KB | 0.7 KB (workers) | Applies to demo chunks, workers, `node-copy`, GSAP, Flip. |
| ORT runtime JS | 60 KB | 15.4 KB (measured in a worker) | `import * as ort from 'onnxruntime-web/wasm'` **inside the worker only**. |
| acorn | 40 KB | - | `await import('acorn')` inside `review.worker.ts`, so it is its own chunk. |
| Latin fonts (5 woff2) | 150 KB | 137.4 KB | Fixed. |
| Models and runtime | encoder 24 MB, detector 6.5 MB, ORT WASM 14,240,000 B | WASM present | Only ever on a tap (detector may auto-load, see `canAutoLoadDetector`). |
| Transferred before interaction, no taps | 450 KB | 263 KB | The script sums HTML + CSS + initial JS + latin fonts + all worker scripts + corpus + build-info + favicon. |
| CLS | 0 | 0 (measured) | Fixed widths in `ch` for live numbers; reserve space for anything that appears after hydration. |
| Long tasks from site code during boot | none over 50 ms | none (measured) | Inference and parsing happen in workers. |

## 5. Global hooks: `html` attributes, DOM ids, CSS

Set by the inline pre-paint script in `index.html` (before first paint) and kept in sync by the preference
store. CSS can rely on them; React should read `usePreferences()` instead of the DOM.

| Attribute | Values | Meaning |
|---|---|---|
| `html[data-js]` | `1` | JavaScript is running. Absent without JS. Use `html[data-js] .x` for "hidden until JS draws it", with a CSS fallback (below). |
| `html[data-theme]` | `light` \| `dark` | Paper or Ink. |
| `html[data-motion]` | `full` \| `lite` | `lite` when the visitor chose it **or** the system asks for reduced motion. |
| `html[data-machine]` | `on` \| `off` | `off` = "Skip the machine" (chosen, or forced by the Basic tier). |
| `html[data-plain]` | `on` \| `off` | Plain-language captions shown. |
| `html[data-tier]` | `full` \| `standard` \| `basic` | Set by `detectTier()` at startup. |

Helper attributes: `data-machine-only` (hidden when the machine is off), `data-machine-off-only` (shown only
then), `data-js-only` (hidden without JS), `data-no-print` (`display: none` under `@media print`; the header, strip, key sheet
and skip link carry it, and S6's `print.css` may put it on anything else that should not reach paper), `data-plain-caption` (set by `PlainCaption`), `data-board`
(**S1: put it on the board's root element**; telemetry's frame sampler finds it and runs only while it is
10% visible), `data-panel-heading` (on each ServicePanel heading; `goToId` focuses it), `data-flip` (elements
a ServicePanel animates on a depth switch).

DOM ids on the home page: `control-room`, `services`, `service-retrieval`, `service-vision`,
`service-policy`, `service-review` (each panel; its heading is `service-<id>-title`, `tabIndex=-1`),
`chaos-lab`, `deploy-history`, `manifest`, `contact`, `colophon`. `routes.ts` exports `SECTION_IDS` and
`serviceAnchor(id)`.

**Recommended pattern for the board's self-draw (S1)**, so cables are neither a visible blink nor lost:

```css
/* hidden only when JS is running and the draw has not happened; a CSS timer reveals them if JS stalls */
html[data-js] .board:not([data-drawn]) .cable { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cable-reveal 0s 3s forwards; }
@keyframes cable-reveal { to { stroke-dashoffset: 0; } }
```
```tsx
// cable <path pathLength={1} className={styles.cable} data-cable=""/> ; on mount:
useEffect(() => {
  const paths = ref.current?.querySelectorAll<SVGPathElement>('[data-cable]')
  if (!paths) return
  return selfDraw(paths, { duration: 0.9, stagger: 0.09, onComplete: () => ref.current?.setAttribute('data-drawn', '') })
}, [])
```
`selfDraw` does nothing under lite motion (it calls `onComplete` at once, so the final drawing shows).

## 6. Cluster API (`src/cluster/`)

### 6.1 Protocol (`protocol.ts`, frozen, types only)

Exactly as spec 6.5: `ServiceId`, `NodeId`, `JobKind`, `JobPayload`, `JobResult`, `Role`, `Resource`,
`Action`, `Stage`, `Hit`, `Box`, `Finding`, `ToWorker`, `FromWorker`. Never edit it. Import with
`import type`.

### 6.2 Registry (`registry.ts`)

```ts
SERVICE_IDS: readonly ServiceId[]                       // ['retrieval','vision','policy','review']
POOL_SIZE: { retrieval: 1, vision: 1, policy: 2, review: 1 }
CONCURRENCY: { retrieval: 4, vision: 2, policy: 1, review: 1 }   // jobs in flight per node
SERVICE_LABEL: Record<ServiceId, string>                // 'Retrieval' ...
nodeIdFor(service, index): NodeId                       // ('policy', 1) -> 'policy-b'
parseNodeId(node): { service, index } | null
serviceOfKind(kind: JobKind): ServiceId                 // 'policy.fuzz' -> 'policy'
allNodeIds(): NodeId[]                                  // retrieval-a, vision-a, policy-a, policy-b, review-a
```

Workers are created from five fixed `new Worker(new URL('../workers/<service>.worker.ts', import.meta.url),
{ type: 'module', name: '<nodeId>' })` calls (Vite only emits an on-origin module worker for that literal
form). **The pool size is fixed at those five factories.** The policy script backs both `policy-a` and
`policy-b`.

### 6.3 Scheduler (`scheduler.ts`)

```ts
import { scheduler } from '../cluster/scheduler.ts'

scheduler.ensureService(service): Promise<void>
scheduler.submit<K extends JobKind>(kind: K, payload: JobPayload[K], opts?: SubmitOptions): JobHandle<K>
scheduler.pullThePlug(service, index?): { node: NodeId; inFlight: string[] }
scheduler.getState(): ClusterState
scheduler.subscribe(listener): () => void
scheduler.onMessage((dir: 'in' | 'out', service, msg: ToWorker | FromWorker, node: NodeId) => void): () => void
scheduler.isSupported(): boolean

interface JobHandle<K> { id: string; kind: K; promise: Promise<JobResult[K]>; cancel(): void }
interface SubmitOptions { onProgress?(p): void; timeoutMs?: number; transfer?: Transferable[]; maxAttempts?: number /* default 3 */ }
```

Semantics you can rely on (all covered by `scheduler.test.ts`):

- **Lazy spawn.** Nothing is spawned until `ensureService(service)` or a `submit` for that service. `submit`
  spawns the pool by itself. `ensureService` resolves when **every** node of the pool has posted `ready`
  (policy: both), and rejects if workers are unavailable (`Worker` missing, or no node became ready within
  10 s). Boot (section 6.9) pre-spawns pools by tier; calling `ensureService` again is free.
- **One FIFO queue per service.** A job runs on the first node of its service with capacity
  (`CONCURRENCY`). Policy and review run one job per node; that is why "batch 7 was running on policy-b"
  is true.
- **Failure handling.** A retryable `error`, a terminated node, a crash or a timeout re-queues the job with
  attempts + 1 **at the front of its queue**, up to `maxAttempts` (default 3), then the promise rejects
  (`Error.message` = `<label> failed after N attempts: <reason>`, with `.attempts` and `.reason`). A
  non-retryable `error` rejects at once with the worker's message. **A job submitted with `transfer` is never
  retried** (its payload was consumed by the transfer); pass `maxAttempts: 1` to say so.
- **`pullThePlug(service, index?)`** really calls `Worker.terminate()`. With no index it picks the busiest
  node, else the last one. It returns the node and the in-flight job ids (empty when idle or not spawned,
  never throws). The node's status is `dead` until the respawned worker (same NodeId, after 0 ms) posts
  `ready`. The retried job may run on the **sibling or on the respawned node itself**, whichever is free first.
- **Cancel.** `handle.cancel()` rejects the promise with an error whose `name` is `'AbortError'`, removes a
  queued job, or tells a running worker `cancel` and frees its slot at once. The promise already has a silent
  `.catch`, so fire-and-forget callers cause no unhandled-rejection noise (awaiting callers still see it).
- **Timeouts** (`timeoutMs`, per attempt) terminate the node (the only way to stop a worker) and retry.
- **`onMessage`** reports every job/cancel (`'out'`) and ready/progress/result/error/log (`'in'`) message,
  **but never `ping`/`pong`**, so the relay and the audio clicks stay still when the system is idle. The 4th
  argument is the node id. Use it to drive relay throws, cable pulses and clicks, never a timer.
- **Notifications** are coalesced to one per microtask; `getState()` returns a stable object until
  something changes (unchanged node records keep their identity).

```ts
interface ClusterState {
  nodes: Record<NodeId, ClusterNodeState>
  queue: Array<{ id: string; kind: JobKind; attempts: number; node?: NodeId }>   // queued (no node) and running (node)
  spans: ClusterSpan[]            // last 200 dispatch attempts, oldest first
  lastEvent?: string              // human sentence for the latest notable event
  recovery?: ClusterRecovery      // set when a job succeeded after a failure
}
interface ClusterNodeState {
  service: ServiceId
  status: 'spawning' | 'ready' | 'busy' | 'dead'
  spawnedAt: number               // performance.now() of the last spawn
  readyAt?: number                // performance.now() of the last ready
  jobs: number                    // jobs completed successfully by this NodeId this session (kept across respawns)
  inFlight: number                // jobs running now
  respawns: number
  rttMs?: number                  // last ping round trip; only measured while the board is visible
}
interface ClusterSpan { id; kind; node; start; end?; attempts /* 1 = first dispatch */; outcome?: 'ok'|'error'|'terminated'|'timeout'; recoveredMs? }
interface ClusterRecovery { jobId; kind; node; retry; ms; sentence }
```

`lastEvent` sentences: `policy-b unplugged · batch 7 in flight`, then on recovery
`retry 1 · batch 7 → policy-a · recovered in 38 ms` (`batch N` is the payload's `batch` number printed
verbatim, **so number batches from 1**; other jobs print their kind). `recoveredMs` is the time from the
first failure of that job to its successful result. Also: `<node> did not start (...)`, `<node> crashed: ...`,
`<node> timed out on ...`, `<label> failed after N attempts: ...`.

### 6.4 Worker side (`src/workers/_base.ts`)

```ts
import { defineWorker, RetryableError } from './_base.ts'

defineWorker('policy-a', {                       // first node id of your service; self.name (the real node) wins
  'policy.evaluate': (payload) => ({ allow: true, policy: 'rbac', audit: '...', us: 3 }),
  'policy.fuzz': async (payload, ctx) => {       // payload: { n, seed, batch }
    ctx.progress({ pct: 50, stage: `batch ${payload.batch}` })
    if (ctx.signal.aborted) throw new RetryableError('cancelled early')   // retryable: the scheduler tries again
    return { evaluated: payload.n, leaks: 0, p95us: 5, totalMs: 12, sample: [ctx.node] }
  },
}, { init: async () => { /* load a corpus, import a heavy module; `ready` is posted after this resolves */ } })
```

`JobContext`: `id`, `kind`, `node`, `signal` (aborted on `cancel`), `progress({ stage?, pct?, bytesLoaded?,
bytesTotal? })`, `log(text, level?)`. A thrown error becomes `{ type: 'error', retryable }`; only
`RetryableError` (or an error with `retryable === true`) is retried. Results are posted by the base. For
`vision.detect` the `ImageBitmap` arrives in the payload (the scheduler transferred it). Unknown job kinds
reply with a non-retryable error. A worker owns only the kinds of its service.

CSP note (`docs/CSP_SPIKE.md`): create ONNX sessions **only inside these on-origin module workers**; never
on the main thread, never in a `blob:` worker.

### 6.5 Quorum (`quorum.ts`)

```ts
import { quorum } from '../cluster/quorum.ts'
import { useQuorum } from '../cluster/store.ts'

quorum.openSecondTab(): boolean          // false if the pop-up was blocked -> show copy.controlRoom.quorumPrompt.blocked
quorum.getState() / quorum.subscribe(l)  // prefer useQuorum()
quorum.onHeartbeat(l): () => void        // fires every 1000 ms (a real timer)
quorum.getHeartbeatCount(): number

interface QuorumState {
  supported: boolean       // false: BroadcastChannel or Web Locks missing/blocked -> single node (term 1, this tab leads)
  nodeId: string           // this tab, e.g. 'tab-k3f9' ('' on the server)
  term: number             // highest known term; never decreases; 0 before start and on the server
  leaderId: string | null
  isLeader: boolean
  peers: Array<{ id: string; lastSeen: number; isLeader: boolean }>   // the OTHER tabs
  nodes: number            // 1 + peers.length
  members: Array<{ id: string; isSelf: boolean; isLeader: boolean; lastSeen: number | null }>   // every tab, this one first
}
```

Protocol on `BroadcastChannel('ruphak-cluster')`: HELLO (peers answer once, so a second tab is visible at
once), HEARTBEAT every 1000 ms, LEADER on lock acquisition, BYE on `pagehide`; peers expire after 3500 ms.
Election: the exclusive Web Lock `ruphak-cluster-leader`; the holder is leader, and `term = max(known) + 1`
on each acquisition. If the leader tab is closed the browser hands the lock to the next waiting tab within
milliseconds. A *suspended* leader that still holds the lock leaves followers with `leaderId: null` after
3.5 s (no election happens while the lock is held). The first election of a lone tab is not announced; later
leader changes are (by F). `/resume/` does not start the quorum.

### 6.6 Telemetry (`telemetry.ts`)

```ts
import { useTelemetry, telemetry } from '../cluster/telemetry.ts'   // useTelemetry is also re-exported by store.ts

telemetry.recordModelBytes(service, loaded, total?)   // call from onProgress while a model/runtime downloads
telemetry.setBoardVisible(boolean) / telemetry.observeBoard(el): () => void   // only if you cannot set data-board
telemetry.isBoardVisible(): boolean

interface TelemetrySnapshot {
  ttfb: number | null; fcp: number | null; lcp: number | null              // ms since navigation start
  workers: Record<NodeId, { spawnAt: number | null; readyAt: number | null; spinUpMs: number | null }>   // performance.now() timeline, same clock as fcp
  models: Partial<Record<ServiceId, { loaded: number; total: number | null; done: boolean }>>
  frames: { avgMs: number; dropped: number; frames: number; fps: number; sampling: boolean }   // dropped = interval > 34 ms; sampling only while data-board is >= 10% visible
  longTasks: { count: number; totalMs: number; maxMs: number }
  resources: Array<{ name: string; bytes: number; ms: number }>             // last 200
}
```

`worker:<node>:spawn` / `:ready` User Timing marks are written automatically. Lite motion batches updates
to one per 500 ms. Nothing is ever transmitted.

### 6.7 Tier (`tier.ts`)

```ts
import { getTier, getTierInfo, canAutoLoadDetector, setTierOverride } from '../cluster/tier.ts'
import { useTierInfo } from '../cluster/store.ts'

getTier(): 'full' | 'standard' | 'basic'      // 'full' on the server and before detectTier() ran
interface TierInfo { tier; detected; override: Tier | null; reasons: string[]; facts: string[];
                     simd; cores; memGB; saveData; slowNet; reduce; benchMs; hasWorker }
canAutoLoadDetector(): boolean                // full tier, no data saver, no slow network (spec 4.2)
setTierOverride(tier | null)                  // writes localStorage['ruphak-tier']; then location.reload() (PreferenceControls variant="panel" does both)
```

`detectTier()` runs once in `main.tsx` before anything lazy loads. `reasons` lists every rule that fired in
plain words ("2 CPU cores", "no WASM SIMD"); `facts` lists what was measured (use it when `reasons` is
empty). Tier effects: `standard` = board updates at 30 fps, vision capture 10 Hz, retrieval BM25 until
tapped; `basic` = the machine is forced off, no camera, no model taps (BM25, the policy playground and the
review demo still run when `Worker` exists). WASM SIMD is required for ORT; without it model taps stay hidden
with a one-line reason (`tier.simd`).

### 6.8 Live region (`live-region.ts`) and audio (`audio.ts`)

```ts
import { announce } from '../cluster/live-region.ts'
announce(text: string, politeness: 'polite' | 'assertive' = 'polite'): void
```
Throttled to one DOM update per 800 ms with coalescing (the first call speaks at once; later calls inside
the window are joined into one update). `Tape` can forward new lines for you (`announce` prop).

```ts
import { audio } from '../cluster/audio.ts'
audio.setEnabled(boolean)   // call from a click/keypress handler (a user gesture)
audio.click()               // relay click; max 20 per second
audio.humStart() / audio.humStop()   // 55 Hz + 110 Hz at -30 dB, 300 ms fades
audio.failover()            // descending two-tone, 180 ms
audio.isEnabled(), audio.getState() -> { enabled, unlocked }, audio.subscribe(l)
```
All calls are safe no-ops until sound is on **and** the context is running. Synthesized only: no files, no
network. `SoundToggle` (F ships a working one; S5 owns it) wires the preference and `setEnabled`.

### 6.9 Boot (`boot.ts`), boot line, formatters

`bootCluster({ route })` is called by `main.tsx` right after the first render. It starts telemetry and the
quorum (not on `/resume/`), announces readiness/events/leader changes, and spawns pools:
`full` → all four on `/`, only its own on `/projects/<id>/`; `standard` → retrieval, policy, review on `/`
(**vision stays on standby until its panel asks**: S3 calls `scheduler.ensureService('vision')` when its panel
nears the viewport or the visitor taps); `basic` → none (services spawn on demand); `/resume/` and
`/experiments/` → none.

```ts
buildBootLine({ fcp, workers, nodes, term }): string     // measured values only; see 5 for the hydration-safe use
BOOT_LINE_PRERENDERED   // 'booting ruphak.me v3 · node 1 of 1'
// e.g. 'FCP 412 ms · retrieval up 530 ms · policy up 544 ms · review up 561 ms · vision standby · 1 node · term 1 · no backend was harmed; this trace is yours.'
formatUptime(ms) -> '00:42' | '1:02:03';  formatBytes(n) -> '14.24 MB' (decimal);  formatMs(ms) -> '412 ms'
```

### 6.10 Hooks (`store.ts`)

```ts
useClusterState<T>(selector: (s: ClusterState) => T): T     // re-renders only when the selected value changes
useQuorum(): QuorumState
useTelemetry(): TelemetrySnapshot
useTierInfo(): TierInfo
useServicePhase(service: ServiceId): ServicePhase      // 'standby' | 'starting' | 'ready' | 'busy' | 'degraded' | 'down'
useJobsInFlight(service: ServiceId): number            // jobs of that service running on a worker now (a cable is "hot" while > 0)
```
`ServicePhase` (pure helpers in `src/cluster/phase.ts`: `servicePhase(state, service)`, `isLit(phase)`,
`jobsInFlight(state, service)`) is the one shared meaning of a whole service's state: `standby` = nothing spawned,
`starting` = spawned but none ready, `ready` / `busy` = every node of the pool is up (idle / at least one running),
`degraded` = some nodes up, some not (policy-b unplugged, policy-a still serving), `down` = no node up and none
starting. Lamps are lit for `ready`, `busy` and `degraded`. Words for each phase: `copy.controlRoom.board.status`.
Use these in the board, the chaos lab and the machine-off list so they never disagree.

Select a primitive or an existing part of the state (`s => s.nodes`, `s => s.nodes['policy-b']?.status`,
`s => s.lastEvent`, `s => s.recovery`). Results are shallow-compared, so a fresh object each call is safe but
wasteful; derive big arrays with `useMemo` over a selected subtree. Do not call `scheduler.getState()`
during render.

## 7. Draw, motion, data, routes

### 7.1 `src/lib/draw/wobble.ts` and `paths.ts` (deterministic: identical on server and client)

```ts
createRng(seed: number | string): () => number          // mulberry32, [0,1)
fmt(n): string                                           // 2 decimals, no "-0"
wobblePoints(points, seed, amp = 0.9): Pt[]              // each point moves <= min(amp, 1.2) px
penLine(points, seed, { amp?, step?, closed? }): string  // d: subdivided, jittered, smoothed
smoothPath(points, closed?): string;  subdivide(points, step?, closed?): Pt[];  hashString(s): number

roundedRect(x, y, w, h, r, seed?, amp?): string          // no seed = crisp arcs; seed = hand-drawn
bracket(x, y, w, h, len, seed?, amp?): string            // four corner strokes (detections, retrieval windows)
hexagon(cx, cy, R, seed?): string;  circle(cx, cy, r): string;  rivet(cx, cy, r?): string
lamp(cx, cy, r, seed?): { bezel, lens, glare, bezelRadius }    // hex bezel R = 1.34 r
LAMP_GLOW_RINGS = [{ k: 2.7, opacity: .12 }, { k: 2.1, opacity: .3 }, { k: 1.55, opacity: .6 }, { k: 1, opacity: 1 }]  // draw in this order, largest first
cable(from: Pt, to: Pt, { sag?, plug?, seed? }): { d, plugA, plugB, mid: Pt }   // set pathLength={1} on the cable path for dash animation
relay(cx, cy, size?, seed?): { body, coil, core, yoke, arm, pivot, tip, armLength, contactLeft, contactRight, terminals, box }
connector(from, to, seed?, curve?): string;  arrowHead(tip, direction, size?, seed?): string
```
Give every drawn object its **own seed** (`'board:lamp:retrieval'`). Style: `stroke: var(--ink)`,
`stroke-width: var(--stroke-draw)`, round caps and joins, `fill: none` (fills use the paper tones). The relay
arm rests vertical about `pivot`; rotate it about that point (about 18°) on each `onMessage`, with
`transform-box: view-box; transform-origin: <pivot x>px <pivot y>px`.

### 7.2 `src/lib/draw/motion.ts`

```ts
loadGsap(): Promise<{ gsap, Flip }>     // GSAP core + Flip, loaded on demand (never import 'gsap' statically: 38 KB gzip)
getGsap(): { gsap, Flip } | null        // synchronous; null until loaded
isLite(): boolean                       // html[data-motion='lite']
selfDraw(elements: ArrayLike<SVGGeometryElement>, { duration = 0.9, stagger = 0.09, onComplete? }): () => void   // returns cancel
goToId(id): boolean                     // smooth scroll (instant when lite) + focus the heading ([data-panel-heading] or first h1-h3)
```
GSAP is used for exactly three things: `selfDraw` (core `gsap.to` on `stroke-dashoffset`; DrawSVG is a Club
plugin and is not used), `Flip` in ServicePanel, and the Meter needle. Everything else is CSS transitions.

### 7.3 Data

```ts
import { projects, experience, skillGroups, profile, highlights } from '../data/portfolio.ts'
// Project gained: serviceId ('retrieval'|'vision'|'policy'|'review'), headlineMetric, route. profile.publishPhone = true.
// projects[0..3] = retrieval, vision, policy, review (the order of the panels).

import { copy, DEPTHS, SERVICE_ORDER, serviceCopy, projectFor, serviceNumber, releases,
         skillLines, certificationLines, educationLine, type Depth, type DepthText, type ServiceCopy } from '../data/copy.ts'
```
`copy` keys: `header`, `strip`, `notFound`, `controlRoom`, `services` (`id label title lead panel retrieval
vision policy review`), `chaos`, `deployHistory`, `manifest`, `contact`, `colophon`, `resume`, `experiments`.
Highlights:

- `copy.controlRoom`: `eyebrow h1 lead plain identity authorship boot{prerendered,closing} quorumPrompt{button,
  hint,blocked,joined(nodes),unsupported} serviceIndex{label,heading,links} board{srDescription,plain,
  sensorsLamp,sensorsCaption,controlPlane,lampName(short,title,status),status,shortNames} machineOff`.
- `copy.services.panel` holds the shared panel strings; `copy.services.<id>` is a `ServiceCopy` plus demo
  strings: `label depth{30s,engineer,peer} trace{decisions,tradeoffs,broke,change} plain caption stamp tapLabel?
  pipeline schematic{title,desc,nodes[{id,label}]} demo{...}`. Demo strings: retrieval `label placeholder chips
  noResults modelMissing`; vision `cameraButton dropImage clip phoneExtra consent{title,body,allow,deny}
  gauges{inference,queue,dropped} deviceFps(n) backpressure noRecording`; policy `label selectors{tenant,role,
  resource,action} allow deny tapeHeader fuzzButton plugButton fuzzResult({leaks,evaluated,perSecond,p95ms})`;
  review `label placeholder seeds astSkipped tiers[{tier,name,shape,label}]`.
- `copy.chaos`: `title lead experiments{plug,tab,leader}{button|instruction, plain, reward(...)} stamp complete
  soundCaption machineOff`. Reward functions take live values; **they never invent them**.
- `copy.deployHistory.releases[{tag, role, note, stackDiff}]` plus `releases()` which joins the role,
  organization, period and proof from `experience`. `neuralInverseNote` is `undefined` on purpose.
- `copy.colophon`: `version authorship sourceUrl credits(url) links changelog[] changelogLine(entry) buildTrace
  telemetry preferences`.
- **Short UI micro-labels** (a button verb, an `aria-label`, a unit) may live in your own files; spec prose
  must come from `copy`. If you need a new sentence in `copy.ts`, leave a SPEC-GAP.

Schematics (`src/data/schematics.ts`):

```ts
getSchematic(service: ServiceKey): { service, title, desc, nodes: SchematicNode[], edges: SchematicEdge[] }
loadNodeCopy(service): Promise<Record<partId, DepthText>>   // what each part says; loaded on the first click (src/data/node-copy.ts)
// pass to ServicePanel: schematic={{ ...getSchematic('vision'), active: ['queue'], annotations: { queue: '2' }, onNode }}
```
Node ids: retrieval `ingest chunk pgvector agents rerank citations`; vision `camera queue yolo websocket react
prometheus`; policy `jwt api evaluator rls audit indexes`; review `diff actions docker eslint semgrep llm tier
comments`. `active` ids tint a part and light a connector when both ends are active; `annotations` puts a
short mono string (a measured `12 ms`) under a part's label.

### 7.4 Routes (`src/routes.ts`)

```ts
type RouteMatch = { kind: 'home' } | { kind: 'project'; id: ServiceId } | { kind: 'resume' } | { kind: 'experiments' } | { kind: 'notfound' }
matchRoute(pathname): RouteMatch;  routeKey(match): string;  routeMeta(match): RouteMeta | undefined
ROUTES: readonly RouteMeta[]        // { key, match, path, file, title, description, og{title,description,image}, priority }
canonicalUrl(path), SITE_URL, OG_IMAGE_URL, SITE_NAME, SECTION_IDS, serviceAnchor(id)
```
Links are plain `<a href>` (no router): `/projects/policy/`, `/resume/`, `/experiments/`, `/#contact`.
`/projects/*` default to the `engineer` depth; every other route to `30s`; a stored choice wins.

## 8. UI components and shell

All in `src/components/ui/` (import with explicit `.tsx`). Styles are in `ui.module.css`.

| Component | Props (all `className?` where it makes sense) | Notes |
|---|---|---|
| `Button` | `variant?: 'primary'\|'secondary'\|'ghost'\|'danger'`, `size?: 'sm'\|'md'\|'lg'`, `icon?`, `iconAfter?`, `pressed?` (toggle: `aria-pressed`), `busy?` (`aria-busy`), plus every `<button>` attribute and `ref` | `type="button"` by default. `danger` is a vermilion edge (for things that break something on purpose); text stays ink. |
| `ButtonLink` | same visual props + every `<a>` attribute | `target="_blank"` adds `rel="noreferrer noopener"`. |
| `Icon` | `name`, `size? = 20`, `title?` | Names: `copy check external pdf sun moon gauge play stop plug menu close volume volume-off help arrow-right camera image text machine upload`. Decorative (`aria-hidden`) unless `title`. |
| `Stamp` | `children`, `tone?: 'ink'\|'cobalt'\|'live'`, `size?: 'sm'\|'md'\|'lg'`, `rotate? = -6`, `shape?`, `animate?`, `as?: 'span'\|'div'` | `sm` is always ink text (tone colours the border); `md`/`lg` may carry the tone as text (>= 18 px). Use `shape` for the severity glyph. |
| `Readout` | `label?`, `value`, `width? = 2` (ch), `size?: 'sm'\|'md'\|'lg'`, `flash? = true` | Doto, round dots, fixed width (CLS 0), 120 ms `--live` flash when `value` changes (primitives only). Doto is for digits and NODES / TERM / UP / MS only. |
| `PlainCaption` | `children`, `label? = 'In plain words'` | Visible while `data-plain='on'`. Mandatory on every panel. |
| `Tape` | `lines: (string \| { id?, text, tone?: 'ink'\|'muted'\|'live'\|'cobalt', plain? })[]` (oldest first), `label` (required), `header?`, `max? = 200`, `announce?`, `empty?`, `height? = '14rem'` | `role="log"`, focusable, sticks to the newest line unless the reader scrolled up. `announce` forwards new lines to the throttled live region (the tape itself is never `aria-live`). Line height is 24 px, aligned to the ruled paper. |
| `Meter` | `label`, `value`, `min`, `max`, `unit?`, `warn?`, `decimals? = 0`, `instant?` | `role="meter"`. SVG analog dial; the needle tweens with GSAP (overshoot), instant under lite. The Readout under it is the real value. `warn` draws a hatched zone to `max`. |
| `DepthSwitch` | `value`, `onChange`, `legend?`, `labels?`, `onIntent?` | Native radio group. ServicePanel already includes one, wired to the preferences. |
| `ConsentDialog` | `open`, `title`, `children`, `confirmLabel`, `cancelLabel`, `onConfirm`, `onCancel`, `returnFocus?: RefObject` | Native modal `<dialog>`. "Not now" is first in the DOM, so it gets focus. Esc, backdrop click and the cancel button all call `onCancel` and return focus. It never starts anything: act in `onConfirm`. |
| `Section` | `id`, `label` (the number), `title`, `lead?`, `children` | `<section id aria-labelledby>` + hex bezel + h2 + lead, content wrapped in `.wrap`. Every section's copy object has `id`, `label`, `title`, `lead`: `<Section id={t.id} label={t.label} title={t.title} lead={t.lead}>`. |
| `Schematic` | `SchematicProps` (see 7.3) + `depth?` | Real `<button>` parts, native node dialog, focus returns on close. ServicePanel renders it for you. |
| `ServicePanel` | `project`, `copy`, `demo?`, `fallback`, `schematic`, `stamp: 'PORT'\|'RULES ONLY'`, `stages?: Stage[]`, `onShowPipeline?`, `pipelineBusy?`, `demoFooter?` | The shared anatomy. `fallback` = what the prerender, the Basic tier and a failed load show (a recorded trace if one exists, otherwise `copy.services.panel.noRun`; never invented numbers). `stages` = measured timings from a real run; use the names in `copy.services.<id>.pipeline` where you can. `onShowPipeline` makes the "Show me the pipeline" button appear: run a real job and feed `stages` as results arrive. `demoFooter` is for a model tap and its size label. The panel owns the depth switch (it writes the global depth and reflows with Flip), the 30 s lead size, the work trace, and the nameplate stamp. |
| `DemoSlot<P>` | `load: () => Promise<{ default: ComponentType<P> }>`, `props?: P`, `fallback?`, `disabled?`, `rootMargin? = '50% 0px'` | Renders the fallback (the panel's, by default) on the server and until the panel is within 50% of the viewport, then imports the demo chunk. It never loads models or the runtime: the demo decides. A render error or a failed import falls back with a one-line note. |
| `usePanelContext()` / `PanelContext` | `{ headingLevel: 1\|2\|3, standalone }` | Provided by `Services` (h3) and by `/projects/*` (h1). You normally never touch it. |

### Preferences and shell (`src/components/shell/`)

```ts
import { usePreferences } from '../shell/preferences-context.ts'
const { theme, motion, motionLite, motionForced, plain, machine, machineOff, machineForced, depth, sound,
        setTheme, toggleTheme, setMotion, toggleMotion, setMachine, toggleMachine, setPlain, togglePlain,
        setDepth, setSound, toggleSound } = usePreferences()
```
Values are **effective**: `motion` is `lite` when the system asks for reduced motion (`motionForced` is then
true and the toggle is disabled); `machine` is `off` on the Basic tier (`machineForced`). Reduced motion does
**not** switch the machine off (see section 10). Sound is never stored. Keys: `ruphak-theme`,
`ruphak-motion`, `ruphak-machine`, `ruphak-plain`, `ruphak-depth`, `ruphak-tier`, `ruphak-operator` (S5).

`PreferenceControls` (`variant?: 'header' | 'menu' | 'panel'`) renders Plain language, Skip the machine,
Ink, Lite motion and Sound as `aria-pressed` toggle buttons; `variant="panel"` adds the device-tier select.
**The Colophon renders `<PreferenceControls variant="panel" />`.** Also: `Header`, `ClusterStrip`,
`SkipLink`, `LiveRegion`, `KeySheet` (the `p r c 2 ?` shortcuts live here; keys are ignored while typing,
with a modifier held, or while a modal dialog is open; Esc is native for dialogs and **S3 listens for Esc
itself to stop the camera**), `SoundToggle`, `PreferencesProvider` (App renders it).

## 9. Per-workstream notes

**S1: Control Room.** Replace `src/sections/control-room/index.tsx` (export `ControlRoom`). Put `data-board`
on the board root. Lamps are `<button>`s over the SVG; their accessible names use
`copy.controlRoom.board.lampName(short, title, status)` with the word `copy.controlRoom.board.status[phase]`
for `phase = useServicePhase(service)` (a service nobody spawned is `standby`; a lamp is lit when `isLit(phase)`;
a cable is hot while `useJobsInFlight(service) > 0`). Click: `goToId('service-' + id)`.
The relay throws only inside `scheduler.onMessage` (never a timer, never on ping/pong, so it is still when
the system is idle). Board render loop: none; no rAF (telemetry's sampler is the only one and F owns it).
The readout flash comes free from `<Readout>`. SENSORS lamp: `typeof DeviceMotionEvent !== 'undefined'`,
decided after mount (never in the first render). The service index links to `#service-<id>`; titles and
`headlineMetric` come from `projects`. Under `machineOff` render the list from `copy.controlRoom.machineOff`
(use `data-machine-only` / `data-machine-off-only` or `usePreferences().machineOff`). Quorum prompt: button
calls `quorum.openSecondTab()`; if it returns false show `copy.controlRoom.quorumPrompt.blocked`; the reward
line uses `copy.controlRoom.quorumPrompt.joined(q.nodes)` once `q.nodes >= 2`, and `.unsupported` when
`!q.supported`; mark it a live region (use `announce` too, sparingly). Style frame, USER_TESTS template:
section 2 item 2.

**S2: Retrieval.** Replace `src/sections/services/retrieval/index.tsx` (export `RetrievalService`),
`src/workers/retrieval.worker.ts` and `scripts/build-corpus.ts` / `scripts/embed-corpus.mjs` (F's placeholders
write a valid empty corpus and skip embedding). `scheduler.submit('retrieval.search', {...})`,
`'retrieval.warm'` at the first use. Tier-1 (`retrieval.loadModel`) only on a tap; report bytes with
`telemetry.recordModelBytes('retrieval', loaded, total)` from `onProgress`. Hide the tap and say
`copy.services.retrieval.demo.modelMissing` while the model is absent; also hide it when
`getTierInfo().simd === false`. The honest caption (`copy.services.retrieval.caption`) is rendered by the
panel and is always visible. `chunker.ts` must be importable by both the build script and the worker (no DOM).

**S3: Vision.** Replace `src/sections/services/vision/index.tsx` (export `VisionService`) and
`src/workers/vision.worker.ts`. The camera starts only after `ConsentDialog` confirms. Frames go to the worker
with `scheduler.submit('vision.detect', { bitmap, ts }, { transfer: [bitmap], maxAttempts: 1 })`; the worker
gets the bitmap by transfer. Keep a bounded ring buffer (capacity 4, drop-oldest) in `src/lib/queue/ring.ts`
and feed the queue-depth, dropped and p95 `Meter`s only from measured values. The ONNX session lives in the
worker (CSP spike). Call `scheduler.ensureService('vision')` when the panel nears the viewport on the standard
tier (the full tier already spawned it). `canAutoLoadDetector()` says whether the 3.5 MB detector may load
without a tap. With no model file: say so and still demonstrate the queue with the camera or motion producer.
Never rewrite the production `30 sustained FPS` metric: show `copy.services.vision.demo.deviceFps(n)` beside it.

**S4: Policy + Review.** Replace the two `index.tsx` files (export `PolicyService`, `ReviewService`) and the
`policy.worker.ts` / `review.worker.ts` placeholders. The policy pool is two nodes configured in F's registry:
submit the fuzz as 10 jobs `{ n: 1000, seed, batch: 1..10 }` (**1-based**, the scheduler prints `batch 7`
verbatim) and merge the results; `scheduler.pullThePlug('policy', 1)` terminates `policy-b`. Show per-batch
progress on a 10-segment meter and print `lastEvent` lines on the audit `Tape`. The result line is
`copy.services.policy.demo.fuzzResult({ leaks, evaluated, perSecond, p95ms })` with **measured** values.
`await import('acorn')` inside `review.worker.ts`. Tier names come from `copy.services.review.demo.tiers`
(shape + label). `review.analyze` returns `stages` with the names in `copy.services.review.pipeline`.

**S5: Chaos Lab + Experiments + Sound UI.** Replace `src/sections/chaos-lab/index.tsx` (export `ChaosLab`),
`src/pages/ExperimentsPage.tsx` (export `ExperimentsPage`) and own `src/components/shell/SoundToggle.tsx`
(F's version works; you may extend it). The reward lines are the functions in `copy.chaos.experiments`; feed
them `useClusterState(s => s.recovery)` (`recovery.node`, `recovery.retry`, `recovery.ms`; note the retried job
may land on the respawned node itself, so say "sibling" only when `recovery.node !== killed node`) and
`useQuorum()` (`leaderId`, `term`, `nodeId`). F already announces unplug/recovery/leader changes: announce only
the experiment-complete line and the stamp. Persist the stamp as `localStorage['ruphak-operator'] = 'v3'`
(wrapped in try/catch). Sound: `audio.setEnabled` from the toggle's click; relay click on `onMessage`; hum
while `useQuorum().isLeader`; `audio.failover()` on a leader change. Under `machineOff` render the list from
`copy.chaos.machineOff`. `/experiments/` is reachable always; the stamp only lights its link.

**S6: Record.** Replace the four `index.tsx` files, `src/pages/ResumePage.tsx`, `src/prerender/agent-files.ts`
(F's version is complete enough to ship) and add `src/styles/print.css` (import it from `ResumePage.tsx`),
`public/og.png` and `docs/og.html`. Contact: email + copy button, **phone link when `profile.publishPhone`**,
LinkedIn, GitHub, résumé links; announce `copy.contact.emailCopied`. The Colophon fetches `/build-info.json`
(`BuildInfo` in `src/prerender/build-info.ts`: html, css, js[{file,bytes,gzipBytes,kind,name,initial}], fonts,
assets (models and runtime, with `present`), `csp` verbatim, routes) and shows live telemetry via
`useTelemetry()` and the tier via `useTierInfo()` (`reasons`, else `facts`). It renders
`<PreferenceControls variant="panel" />`. `buildAgentFiles` keeps its **allow-list of profile fields**; the
phone number must never be added. Delete `public/sitemap.xml` (the prerender writes `dist/sitemap.xml`).
Manifest: fetch `/profile.json` from the same origin for "View as agent".

## 10. Deviations and SPEC-GAPs (F's decisions)

1. **Initial JS budget.** React 19.2.8 DOM alone is 59 KB gzipped, so the spec's single "95 KB for React +
   shell + cluster + board" cannot hold. React is a separate long-cached vendor chunk; `index-*.js` keeps the
   spec's 95 KB, the vendor chunk is capped at 62 KB, and a new cap of 125 KB covers the sum (today 95.5 KB).
2. **Doto uses `full.css`** (not `wght.css`): the `wght` file has no `ROND` axis, which the round-dot
   readouts need (+0.7 KB; latin fonts total 137.4 KB). **Big Shoulders `wght.css` has no `opsz` axis**
   (spec chose that file for size), so `font-optical-sizing` has no effect on it.
3. **Reduced motion does not force "Skip the machine"** (spec 5 says it does; 4.0 and 4.1 say the board
   renders its final state under reduced motion, and S1's acceptance depends on that). Only the Basic tier
   forces the machine off.
4. **`window.open(url, '_blank', 'noopener')` always returns null**, so it cannot detect a blocked pop-up.
   `quorum.openSecondTab()` opens normally and cuts `opener` by hand; it returns false only when blocked.
5. **Device benchmark.** "200k xorshift iterations" take under 1 ms on any current phone, so the spec's
   120/400 ms thresholds could never fire. `tier.ts` runs 8M iterations in 250k slices, stops at 30 ms and
   extrapolates, so the benchmark is never a long task; thresholds are unchanged.
6. **`copy.services.lead`** drops the spec's "numbers on the left / demo on the right" (the panel puts the
   demo on the left); it now says "The numbers were measured on the production systems; the demo runs on your
   machine, right now."
7. **`tsconfig.app.json` excludes `*.test.ts`; `tsconfig.node.json` includes `scripts` and the tests** (with
   the DOM lib and Node types), so app code cannot reach Node globals and tests can.
8. **`dev` and `build` also run `copy-ort.mjs`** (idempotent), so a `pnpm install --ignore-scripts` checkout
   still ships ORT. `postinstall` runs it too. `allowBuilds.protobufjs = false` in `pnpm-workspace.yaml`
   (an onnxruntime-web dependency whose install script only fetches CLI helpers).
9. **Extra files F created** beyond the spec's list: `scripts/build-corpus.ts` and `scripts/embed-corpus.mjs`
   placeholders (the spec's `build` script calls them but they belong to S2), `src/components/shell/SoundToggle.tsx`
   (the header needs it; S5 owns it from now), `DemoSlot`, `src/data/schematics.ts`, `src/data/node-copy.ts`,
   `src/cluster/{boot,boot-line,format}.ts`, `src/components/shell/preferences-store.ts`,
   `scripts/csp-spike/`, `src/prerender/build-info.ts`.
10. **Small API additions over the spec** (all backward compatible): `ClusterState.recovery`,
    `ClusterNodeState.{inFlight,respawns,rttMs}`, `QuorumState.members`, `quorum.onHeartbeat`,
    `telemetry.{observeBoard,setBoardVisible,isBoardVisible,setLite}`, `TierInfo.{facts,detected,override}`,
    `createWorker(service, index, handlers, options?)` (the scheduler injects it), `defineWorker(node, handlers,
    { init })`, `SchematicProps.{service,annotations}`.
11. **CSP.** No `'wasm-unsafe-eval'`: the spike passed in Chrome 154. **Firefox and Safari were not tested**
    (only Chrome is available); see `docs/CSP_SPIKE.md` for how to run the harness there.
12. **Prerender detail.** The prerender verifies that the CSP meta is identical in every page and that every
    inline script is hashed; `scripts/csp-hash.test.mjs` pins the whole policy string. 404.html is the home
    page; `main.tsx` renders unknown paths from scratch (it hydrates only when `#root[data-route]` matches).
13. **`--ink-muted` is `#4B4741`, not the spec's `#4E4A44`.** The spec's value measures 6.89:1 on `--paper-2`
    (the panel fill), under the spec's own 7:1 rule for all text; `#4B4741` is 7.23:1 there and 7.98:1 on
    `--paper`. Every other token is exactly the spec's. The dark theme already passes.
14. **Class names are shortened in production** (`q` + 6 characters). Do not select by class name from tests
    or from the Experiments page; use roles, ids and `data-*` attributes.

## 11. Commands

```bash
pnpm install          # copies public/ort/ (postinstall)
pnpm dev              # copy-ort, build-corpus, vite (readable class names, no prerender)
pnpm lint             # eslint (includes the extension rule)
pnpm test             # node --test "src/**/*.test.ts" "scripts/**/*.test.mjs"
pnpm build            # tsc -b, client build, SSR build, prerender, embed-corpus, check-budgets
pnpm preview          # serves dist/ (use localhost, not 127.0.0.1)
pnpm check            # lint + test + build: the gate
pnpm csp:hash         # after ANY edit to the inline script in index.html (pnpm test fails until you do)
```
