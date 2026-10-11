# ruphak.me v3: QUORUM

A portfolio that is a small, real distributed system running in the visitor's browser. Web Workers are the
nodes, open tabs form a quorum (BroadcastChannel + Web Locks, with a term counter), and the four résumé
projects run as honest in-browser ports that you can run, break and watch recover. It is drawn as a hand-built
relay switchboard on warm paper. No WebGL, no backend, no generated imagery.

- **Live:** https://www.ruphak.me (GitHub Pages)
- **Build spec:** [`docs/REDESIGN_SPEC.md`](docs/REDESIGN_SPEC.md) · research: [`docs/RESEARCH.md`](docs/RESEARCH.md)
- **Contract for contributors:** [`docs/INTERFACES.md`](docs/INTERFACES.md) · CSP experiment: [`docs/CSP_SPIKE.md`](docs/CSP_SPIKE.md)

## Run it

```bash
pnpm install     # also copies the ONNX Runtime WASM into public/ort/ (generated, git-ignored)
pnpm dev         # http://localhost:5173
pnpm check       # lint + tests + build + prerender + budgets (the CI gate)
pnpm preview     # serve dist/ at http://localhost:4173 (use localhost)
```

Node 24 (CI) or newer; pnpm 11.8.0. Scripts under `scripts/` and the tests run directly under Node's type
stripping, so relative imports in `src/` carry explicit extensions (a local lint rule enforces it).

## What is real

| Claim | How to check it |
|---|---|
| The services are Web Workers | DevTools: five on-origin module workers (`retrieval-a`, `vision-a`, `policy-a`, `policy-b`, `review-a`); `performance.getEntriesByType('mark')` shows `worker:<node>:spawn/ready` |
| Tabs form a quorum | Open the page in two tabs: `NODES 2`. Close the leader tab: the survivor's `TERM` goes up within 2 s |
| "Pull the plug" is real | It calls `Worker.terminate()`; the scheduler span shows `terminated`, then a retried attempt with `recoveredMs` |
| Telemetry is yours | FCP, LCP, worker times, frame budget are read from `PerformanceObserver` in your browser and never sent anywhere |
| Nothing is uploaded | `connect-src 'self'` in the CSP; the camera never leaves the device |

Honest limits: each project is a **port**, labelled as one (`PORT` / `RULES ONLY` stamps and an always-visible
caption). Production numbers were measured on the real systems; the demos report your device's numbers.
ONNX model files, the clip and recorded traces are provided by the owner (see `public/models/README.md`);
until then retrieval is BM25 and the vision panel says the detector is not published yet.

## Where things live

```
index.html                 pre-paint script (sha256 in the CSP meta), prerender markers, JSON-LD
src/main.tsx App.tsx       entry (hydrate or render), routes
src/styles/                tokens.css (palette, type, motion), base.css, utilities.css
src/cluster/               protocol, scheduler, worker-host, registry, quorum, telemetry, tier, audio, store, boot
src/workers/               _base.ts (defineWorker) + one worker per service
src/lib/draw/              pen wobble, drawing helpers (lamp, cable, relay, bracket), GSAP loader
src/components/{shell,ui}/ header, strip, preferences; Button, Stamp, Tape, Meter, Schematic, ServicePanel, ...
src/sections/              Control Room, Services (4 panels), Chaos Lab, Deploy History, Manifest, Contact, Colophon
src/data/                  portfolio.ts (facts), copy.ts (all prose), schematics.ts, node-copy.ts
src/prerender/             server entry, agent files (profile.json, llms.txt, sitemap.xml), build info
scripts/                   prerender, check-budgets, csp-hash, copy-ort, class-names (short CSS class names), csp-spike harness
docs/                      spec, research, interfaces, CSP spike
```

## Before you ship (owner checklist)

Everything the build can verify, `pnpm check` verifies. These are the things only you can do or decide:

- [ ] **Model files, the clip and a recorded run** (optional; the site is honest without them). Retrieval is BM25 until
  you add `public/models/minilm/model_quantized.onnx`; the vision panel says its detector is not published until you
  add `public/models/yolov8n/yolov8n-320.onnx`. Recorded traces come from a real run with `?record=1` on your own
  device. Steps: `public/models/README.md` and `public/models/yolov8n/README.md`. Nothing here was downloaded or faked.
- [ ] **Two user read-throughs.** `docs/USER_TESTS.md` is a template and says so; nobody has been tested yet.
- [ ] **Firefox and Safari.** The build was only exercised in Chrome. Check the quorum (BroadcastChannel and Web Locks),
  the camera dialog, the iOS motion permission and the print stylesheet before you announce it.
- [ ] **`copy.colophon.sourceUrl`** (`src/data/copy.ts`) points at `https://github.com/RuphakVarmaa`; use the exact repository.
- [ ] **Copy you own.** The work-trace paragraphs marked `[OWNER REVIEW]`, the Neural Inverse dates (Sep 2022 - Sep 2024
  precede the 2024 degree start; kept verbatim), and whether the phone number stays visible (`profile.publishPhone`
  in `src/data/portfolio.ts`; it is never in `profile.json`, `llms.txt` or the JSON-LD).
- [ ] **Budgets.** `dist/index.html` is within about 1 KB of its 60 KB limit. If you lengthen the copy and the build
  fails, trim the prose or raise the limit on purpose in `scripts/check-budgets.mjs`; do not edit the check around it.

## Making-of (skeleton)

This section is for the owner to grow into the write-up that the Colophon links to.

1. **Why a cluster.** Every backend portfolio in the research simulates a system; this one runs it.
2. **The scheduler.** One FIFO queue per service, retries at the front of the queue, `terminate()` on purpose,
   respawn after 0 ms, spans with `recoveredMs`. Tested with fake workers and a manual clock.
3. **The quorum.** Raft-style term, a Web Lock as the election, HELLO/HEARTBEAT/LEADER/BYE over a
   BroadcastChannel; a property test proves the term never decreases across random joins, closes and crashes.
4. **The drawing.** Code-authored SVG with a seeded pen wobble that is identical on the server and the client.
5. **The budgets.** Prerendered HTML, one CSS file, React as a cached vendor chunk, everything heavy behind a
   tap. `scripts/check-budgets.mjs` fails the build on a breach.
6. **What I would change.** (owner to write)

## Content

Résumé-derived facts live in `src/data/portfolio.ts`; all first-person prose in `src/data/copy.ts`
(paragraphs marked `[OWNER REVIEW]` were drafted strictly from the résumé bullets; edit any sentence that
overstates). The downloadable résumé is `public/Ruphak-Varmaa-Resume.pdf`; an HTML résumé is prerendered at
`/resume/`. Agents get `/profile.json`, `/llms.txt` and `/sitemap.xml` (the phone number is shown on the page
but is never in these files).

## Licences

Fonts are self-hosted from `@fontsource-variable/*` (SIL OFL 1.1): Big Shoulders, Big Shoulders Stencil,
Atkinson Hyperlegible Next, Martian Mono, Doto.
