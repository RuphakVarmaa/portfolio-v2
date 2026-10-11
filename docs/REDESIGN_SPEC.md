# QUORUM — ruphak.me v3 BUILD SPEC

Status: definitive build spec for the `redesign-2026` branch. Implementation engineers have only this document and the repo. Where this document and the repo disagree, this document wins; where this document is silent, choose the option that keeps the page honest, static, accessible and small, and leave a `// SPEC-GAP:` comment.

Repo: `/Users/ruphakvarmaa/Documents/Codex/2026-08-13/hi/work/research/portfolio-v2`
Live: https://www.ruphak.me (GitHub Pages, custom domain via `public/CNAME`)
Stack kept: Vite 8.2.1 · React 19.2.8 · TypeScript 6.0.3 strict · GSAP 3.15 · pnpm 11.8.0 (`minimumReleaseAge` enforced; exclusions in `pnpm-workspace.yaml`) · strict meta CSP · GitHub Pages via `.github/workflows/deploy.yml` (`pnpm check` is the gate).
Stack dropped: `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`, `@fontsource-variable/manrope`, `@fontsource-variable/jetbrains-mono`, `@phosphor-icons/react`. No WebGL anywhere on the site.

---

## 0. Table of contents

1. Concept
2. Art direction and design tokens
3. Information architecture and copy
4. Interaction and motion per section (incl. reduced motion, Basic tier)
5. Fast path for recruiters
6. Technical architecture
7. File ownership map (F + S1–S6)
8. Budgets, accessibility, browser support
9. Definition of Done (Opus review checklist)
10. Owner-confirmation items (do not silently change)

---

## 1. Concept

### 1.1 One-liner

**QUORUM**: ruphak.me v3 is a tiny, real distributed system that boots in the visitor's browser. Web Workers are the nodes, open tabs form a quorum, the four résumé projects run as live in-browser services you can run, break and watch recover. The whole thing is drawn as a hand-built relay switchboard on warm paper, not a dashboard.

### 1.2 Big idea

Every backend-engineer portfolio in the research simulates a system with CSS and casts the visitor as an HTTP request. QUORUM inverts both halves:

1. The visitor is the **operator on call**, not the request.
2. **Nothing is simulated.** The control plane is the main thread (a real scheduler with a job queue, retries and spans). Each service is a real Web Worker. The cluster is real: tabs discover each other over `BroadcastChannel`, elect a leader with the Web Locks API, replicate state and fail over when the leader closes. Telemetry is the visitor's own session (paint timing, worker spin-up, model bytes, frame budget). Each project is an honest in-browser **port**, labelled as a port: BM25/embedding retrieval with citations over the site's own text; YOLOv8n detection on the phone camera with a real producer–consumer queue; a 10,000-evaluation RBAC fuzz that reports cross-tenant leaks; a five-tier rules engine over pasted code.
3. "Pull the plug" terminates a real worker and the scheduler really reroutes the job.

It is new because the distributed-systems claims are verifiable by the visitor, on a static host, with no backend. It is legible to non-engineers because every panel carries a plain-language caption and a three-depth explanation switch (30-second / engineer / peer), with the 30-second level on by default.

### 1.3 Judge must-fix items, resolved (binding)

| Must-fix | Resolution in this spec |
|---|---|
| Quorum on the first screen | The masthead carries a live readout `NODES 1 · TERM 1` and a button **"Open this page in a second tab"**. The reward line appears in the hero, not the footer. (§3.2, §4.1) |
| Real project titles + one headline metric above the fold; demote session telemetry | The hero's right column is the **Service index**: four real titles, each with one headline metric, each a link. The boot log is a single mono line under the headline; the full telemetry panel moves to the Colophon. Lamps are labelled with the real project titles. (§3.2) |
| One signature visual language with authorship, not generic lamps + trend type | Relay-switchboard language: jewel lamps with hex bezels, cobalt patch cables with plug ends, a relay whose contact arm physically throws on every message, stencil labels. Type: **Big Shoulders + Big Shoulders Stencil** (Chicago industrial signage), **Atkinson Hyperlegible Next** (text; chosen because this site competes on the accessibility axis), **Martian Mono** (logs), **Doto** (dot-matrix readouts). No Bricolage, no Fraunces, no Manrope, no JetBrains Mono. (§2) |
| Retrieval spec honesty: encoder context vs 512-token windows | The port uses **256-wordpiece windows with 64 overlap** because all-MiniLM-L6-v2's effective context is 256 wordpieces; the panel says so in one sentence next to the production fact (512-token). BM25 and embeddings share the same chunk ids. (§3.3a, §6.6) |
| Budget the ORT WASM binary | `onnxruntime-web@1.30.0` ships one WASM build: `ort-wasm-simd-threaded.wasm` = **14.24 MB**. It is served on-origin from `/ort/`, downloaded only on an explicit tap, counted in the Colophon build trace and in the tap label. (§6.6, §8.1) |
| Build-time embeddings must match the browser | Build-time embeddings are produced with the **same** `onnxruntime-web` package and the **same** quantized file under Node; `pnpm test` runs a parity test (cosine ≥ 0.999 on 5 fixed sentences). (§6.6) |
| Style-frame spike + two non-engineer tests before visual work | S1 ships a static style frame (`docs/style-frame.html`, hand-authored SVG) as its first deliverable and records two non-engineer read-throughs in `docs/USER_TESTS.md` before the board animates. (§7, §9) |
| Cluster is not on the résumé; make authorship clear | Hero sentence: "The cluster is new work, built for this site. The four services are ports of my projects." Colophon repeats it with the source link. (§3.2, §3.8) |
| 30-second depth default, user-tested | Depth defaults to `30s`; Plain-language captions are mandatory on every panel; two non-engineer tests are a DoD item. (§4, §9) |

### 1.4 Signature moments (what gets screenshotted)

1. The masthead readout flipping from `NODES 1` to `NODES 2 · TERM 1` when the visitor opens a second tab, and the hero line: "That tab just joined this one. Close whichever is leader; the other takes over."
2. The boot log that is true: `FCP 412 ms · retrieval up 530 ms · policy up 544 ms · 2 nodes · no backend was harmed; this trace is yours.`
3. Pull the plug mid-fuzz: a lamp goes dark, the sibling worker picks up the job, the tape prints `retry 1 · recovered in 38 ms`.
4. Point a phone at a desk: YOLO brackets with live p95 and queue depth; shake the phone, the motion producer floods the queue and backpressure engages on the meter.
5. Ask "what did Ruphak do with pgvector?" and get a cited chunk, its score, and the window brackets drawn over the page's own paragraph.
6. `0 cross-tenant leaks · 10,000 evaluations · verified in your browser just now`.

### 1.5 Narrative flow

- **0–400 ms (prerendered HTML, no JS):** warm paper, "Ruphak Varmaa S" in Big Shoulders, the one-sentence identity, the Service index (four titles + one metric each, all links), Résumé and Contact links, the masthead readout `NODES 1 · TERM —` and a mono boot line `booting ruphak.me v3 · node 1 of 1`. No curtain, no logo intro, no progress bar.
- **~400 ms–3 s:** JS hydrates. The board draws itself plotter-style (SVG stroke-dashoffset, 900 ms, skipped under reduced motion). Each service lamp lights the millisecond its worker posts `ready`. The readout gains `TERM 1` once the Web Lock is acquired. On phones a fifth lamp, SENSORS, lights and the caption says "your phone can do something the laptop can't — scroll to Vision."
- **The page (one vertical page, native scroll, section URLs):** 1 Control Room → 2 Services (four panels) → 3 Chaos Lab → 4 Deploy History → 5 Manifest → 6 Contact + Résumé → 7 Colophon. A slim sticky footer strip shows `nodes · term · uptime` so the system never stops running while you read.

---

## 2. Art direction and design tokens

### 2.1 Palette (a decision, not a theme)

Light ("paper") is the default. Dark ("ink") is the same two inks inverted plus a dither texture on lamp glows. Never lime, never purple, never gradients except the quantized lamp glow.

```css
/* src/styles/tokens.css — F owns */
:root {
  /* paper theme (default) */
  --paper:        #F3EEE4;  /* page background */
  --paper-2:      #EAE3D6;  /* panel fill, tape background */
  --paper-3:      #DED6C6;  /* pressed / rule fill */
  --ink:          #1C1B18;  /* text, drawings            14.9:1 on paper */
  --ink-muted:    #4E4A44;  /* captions, labels           ≥7:1 on paper */
  --ink-rule:     #B9B1A2;  /* hairlines, ruled paper */
  --cobalt:       #1F3FD1;  /* wires, allow-state, links  6.75:1 on paper — links underlined, never below 16 px */
  --cobalt-soft:  color-mix(in oklab, var(--cobalt) 18%, var(--paper));
  --live:         #D8431F;  /* vermilion: things happening NOW. Marks, needles, lamps, stamps. Never body text. */
  --live-text:    #A32E0E;  /* vermilion for text ≥ 18 px only */
  --live-soft:    color-mix(in oklab, var(--live) 16%, var(--paper));
  --lamp-off:     #CFC7B6;
  --focus:        var(--cobalt);
  --selection:    var(--cobalt-soft);
  color-scheme: light;
}
html[data-theme='dark'] {
  --paper:        #141311;
  --paper-2:      #1C1A17;
  --paper-3:      #26231F;
  --ink:          #ECE6D8;  /* 14.9:1 */
  --ink-muted:    #B5AEA2;  /* 8.4:1 */
  --ink-rule:     #3C3832;
  --cobalt:       #9FB0FF;  /* 8.96:1 */
  --live:         #FF7A55;  /* 7.2:1 */
  --live-text:    #FF7A55;
  --lamp-off:     #2E2A25;
  color-scheme: dark;
}
```

Rules:
- Text is always `--ink` or `--ink-muted`. `--live` carries text only at ≥ 18 px (readouts, stamps). Contrast for all text ≥ 7:1 in both themes; S-workstreams verify with the DevTools contrast picker.
- `--cobalt` = connection and allow. `--live` = right now (heartbeat, pulled plug, deny, needle, lit lamp).
- `--lamp-off` is the only grey; there are no other greys.
- Preference keys in `localStorage` stay `ruphak-theme` (`light` | `dark`); the UI labels say "Paper" / "Ink".

### 2.2 Type (self-hosted via @fontsource-variable; `font-src 'self' data:` unchanged)

| Role | Family | Package (exact) | File used | Size |
|---|---|---|---|---|
| Display (name, section titles, big numerals) | Big Shoulders (variable, wght 100–900, opsz 10–72) | `@fontsource-variable/big-shoulders@5.3.0` | `wght.css` → latin wght | 36.5 KB |
| Stencil labels (panel labels, lamp names, stamps, section numbers) | Big Shoulders Stencil | `@fontsource-variable/big-shoulders-stencil@5.3.0` | `wght.css` | 37.3 KB |
| Text | Atkinson Hyperlegible Next (variable wght 200–800) | `@fontsource-variable/atkinson-hyperlegible-next@5.3.0` | `wght.css` (normal only; no italic) | 34.0 KB |
| Mono (boot log, tape, trace, code) | Martian Mono (variable wght 100–800, wdth 75–112.5) | `@fontsource-variable/martian-mono@5.3.0` | `wght.css` | 23.6 KB |
| Readouts (NODES/TERM counter, lamp numerals, meters) | Doto (variable wght, ROND 0–100) | `@fontsource-variable/doto@5.3.0` | `wght.css` | 5.4 KB |

Total latin woff2 ≈ 137 KB. Import exactly these in `src/main.tsx` and in `src/prerender/entry-server.tsx`'s critical CSS list:

```ts
import '@fontsource-variable/big-shoulders/wght.css'
import '@fontsource-variable/big-shoulders-stencil/wght.css'
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css'
import '@fontsource-variable/martian-mono/wght.css'
import '@fontsource-variable/doto/wght.css'
```

fontsource emits `font-display: swap`. Metric-matched fallbacks (F adds in tokens.css):

```css
@font-face { font-family: 'Atkinson Fallback'; src: local('Arial'); size-adjust: 104%; ascent-override: 92%; descent-override: 22%; line-gap-override: 0%; }
@font-face { font-family: 'Big Shoulders Fallback'; src: local('Arial Narrow'), local('Arial'); size-adjust: 78%; }
:root {
  --font-display: 'Big Shoulders Variable', 'Big Shoulders Fallback', sans-serif;
  --font-stencil: 'Big Shoulders Stencil Variable', 'Big Shoulders Fallback', sans-serif;
  --font-text:    'Atkinson Hyperlegible Next Variable', 'Atkinson Fallback', system-ui, sans-serif;
  --font-mono:    'Martian Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace;
  --font-readout: 'Doto Variable', var(--font-mono);
}
```

Type scale (fluid, rem-based; root 16 px; `font-optical-sizing: auto`):

```css
:root {
  --fs-masthead: clamp(3rem, 1.2rem + 8vw, 8.5rem);     /* Big Shoulders 800, opsz 72, line-height .9, letter-spacing -.01em, uppercase */
  --fs-h2:       clamp(2rem, 1rem + 3.5vw, 3.75rem);    /* Big Shoulders 700, uppercase, tracking .01em */
  --fs-h3:       clamp(1.5rem, 1.1rem + 1.4vw, 2.25rem);/* Big Shoulders 600 */
  --fs-numeral:  clamp(2.5rem, 1.5rem + 4vw, 5rem);     /* Big Shoulders 800 metrics */
  --fs-lead:     clamp(1.25rem, 1.05rem + .7vw, 1.625rem); /* Atkinson 400, lh 1.4 */
  --fs-body:     1.0625rem;                             /* Atkinson 400, lh 1.55, measure 62ch max */
  --fs-small:    .9375rem;                              /* Atkinson 400 captions */
  --fs-label:    .8125rem;                              /* Stencil 600 uppercase, tracking .12em */
  --fs-mono:     .875rem;                               /* Martian Mono 400, wdth 90 */
  --fs-readout:  clamp(1.25rem, 1rem + 1vw, 1.75rem);   /* Doto 700, ROND 100 via font-variation-settings */
}
```

Doto readouts must set `font-variation-settings: 'ROND' 100` (round dots like an LED annunciator). Doto is used only for digits and the words NODES / TERM / UP / MS; never for sentences.

### 2.3 Spacing, grid, radii, lines

```css
:root {
  --s-1: .25rem; --s-2: .5rem; --s-3: .75rem; --s-4: 1rem; --s-5: 1.5rem; --s-6: 2rem; --s-7: 3rem; --s-8: 4.5rem; --s-9: 7rem;
  --gutter: clamp(1rem, 4vw, 4rem);     /* ≥16 px at every width */
  --content-max: 1360px;
  --measure: 62ch;
  --radius-0: 0;        /* panels, tape, cards: square — it is a switchboard */
  --radius-1: 2px;      /* inputs, buttons */
  --radius-lamp: 50%;
  --rule: 1px solid var(--ink-rule);
  --rule-strong: 1.5px solid var(--ink);
  --stroke-draw: 1.75px;   /* all hand-drawn SVG strokes, round caps + joins */
  --z-header: 40; --z-strip: 30; --z-dialog: 80;
}
```

Grid: 12 columns ≥ 1024 px, 6 at 640–1023, 4 below 640. Service panels: demo left (7 cols) / work trace right (5 cols) ≥ 1024; stacked below (demo first). No horizontal page scroll at any width ≥ 320 px.

### 2.4 Motion tokens ("motion is causal")

```css
:root {
  --dur-1: 120ms;   /* relay throw, lamp on/off */
  --dur-2: 240ms;   /* panel expand, depth switch */
  --dur-3: 420ms;   /* dialog, stamp */
  --dur-boot: 900ms;/* board self-draw */
  --ease-out: cubic-bezier(.16, 1, .3, 1);
  --ease-relay: cubic-bezier(.2, .9, .1, 1);        /* mechanical: fast, one overshoot, settle */
  --ease-needle: cubic-bezier(.34, 1.56, .64, 1);   /* meter needle overshoot */
}
@media (prefers-reduced-motion: reduce), (html[data-motion='lite']) { /* see §4.0 */ }
```

Nothing moves unless a real event happened: `postMessage`, worker `ready`, lock acquired, frame processed, job retried. The only idle motion is the leader heartbeat lamp at its true 1000 ms interval. Banned: scroll pinning, horizontal reels, typewriter text, number counters, cursor followers, parallax, grain overlays, preloaders.

GSAP is used for exactly three things: the boot self-draw (`DrawSVG` is a Club plugin — do NOT use; animate `stroke-dashoffset` with core `gsap.to`), `Flip` for depth-switch reflow inside one ServicePanel, and the meter needle tween. Everything else is CSS transitions.

### 2.5 Texture and drawing language

- **Hand-drawn SVG, code-authored for v3.0.** All drawings (board, schematics, meters, stamps) are inline SVG authored in the repo with `stroke: var(--ink)`, `stroke-width: var(--stroke-draw)`, `stroke-linecap: round`, `stroke-linejoin: round`, `fill: none`, and a deterministic "pen wobble" (`src/lib/draw/wobble.ts`, F) that displaces path points by ≤ 1.2 px using a seeded PRNG so the wobble is identical on server and client (hydration-safe). The Colophon states "drawings: hand-built SVG, no generated imagery". The owner may replace any drawing with a scanned hand drawing later; **AI-generated imagery is forbidden anywhere**.
- **Lamp glow = quantized, not smooth.** A lit lamp uses four concentric rings at 100/60/30/12 % `--live` opacity (an SVG `<radialGradient>` with hard stops), plus an `<pattern>` of 2 px dots (1-bit dither) for the outer halo in dark mode.
- **Video dither (Vision only):** canvas pass converting frames to two-tone (paper/ink) with a 4×4 Bayer matrix, at ≤ 320 px wide; cheap and unmistakably designed.
- **Paper:** flat `--paper`; a 24 px ruled-paper line pattern (`--ink-rule` at 35 % opacity) appears only behind the tape and trace components.
- **Stamps:** rotated −6°, stencil face, 1.5 px ink border, used for "CERTIFIED OPERATOR", "PORT", "RULES ONLY", severity tiers.
- No icons library. The 9 icons needed (copy, check, external, pdf, sun/moon, gauge, play, stop, plug) are inline SVGs in `src/components/ui/Icon.tsx` (F), drawn in the same stroke language.

---

## 3. Information architecture and copy

Every fact below (numbers, dates, names, stacks) is identical to `src/data/portfolio.ts`. Copy is rewritten in first person. Prose lives in `src/data/copy.ts` (F) so sections never hard-code strings. Paragraphs marked **[OWNER REVIEW]** are drafted strictly from the résumé bullets; they ship as written unless the owner edits `copy.ts`.

### 3.0 Routes

| Route | Prerendered file | Title | Content |
|---|---|---|---|
| `/` | `dist/index.html` | Ruphak Varmaa S — backend and AI systems; this site is one | Full page §3.1–3.8 |
| `/projects/retrieval/` | `dist/projects/retrieval/index.html` | Agentic RAG Document Intelligence — Ruphak Varmaa S | Header + that ServicePanel (depth defaults to `engineer`) + footer strip |
| `/projects/vision/` | … | Real-Time Vision Analytics — … | same |
| `/projects/policy/` | … | Multi-Tenant RBAC Platform — … | same |
| `/projects/review/` | … | Automated Code Review Pipeline — … | same |
| `/resume/` | `dist/resume/index.html` | Résumé — Ruphak Varmaa S | HTML résumé, print CSS, PDF link |
| `/experiments/` | `dist/experiments/index.html` | Experiments — ruphak.me | the lab (§3.8) |
| `/404.html` | copy of `dist/index.html` | — | SPA boot for unknown deep links |
| `/profile.json`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`, `/security.txt`, `/og.png` | generated or static | — | agent/crawler files |

Section ids on `/` (also hash targets): `#control-room`, `#services`, `#service-retrieval`, `#service-vision`, `#service-policy`, `#service-review`, `#chaos-lab`, `#deploy-history`, `#manifest`, `#contact`, `#colophon`.

### 3.1 Header (Quick-view rail) — on every route

Left: wordmark "RUPHAK VARMAA S" (stencil, links to `/`). Centre: `Projects · Résumé · Contact` (keys **p / r / c**; the hint `p r c` shown in mono at ≥ 900 px). Right: readout `NODES 1 · TERM 1` (Doto; hidden on `/resume/`), then toggles: **Plain language** (aria-pressed), **Skip the machine** (collapses the board to a list), **Paper/Ink**, **Motion**, **Sound** (off). On < 900 px the toggles live in the existing focus-trapped menu pattern; the three rail links and the readout stay visible.

### 3.2 §1 Control Room (hero + live board) — `#control-room`

**Left column (prerendered):**

- Eyebrow (stencil): `RUPHAK VARMAA S · BACKEND AND AI SYSTEMS · COIMBATORE`
- H1 (display): `I build backend and AI systems.`
- Lead: `This website is one. It is a small cluster running in your browser: the workers are the nodes, your tabs form a quorum, and my four projects run as live services you can start, break and watch recover.`
- Plain-language caption (shown when Plain is on): `Workers are little helpers inside your browser. The leader hands out jobs. Open this page in a second tab and the two tabs start talking; close the leader and the other one takes over.`
- Identity line (small): `Third-year B.E. Computer Science and Engineering, KPR Institute of Engineering and Technology, Coimbatore · 2024 - 2028 · CGPA 8.5/10.`
- Authorship line (small): `The cluster is new work, built for this site. The four services are ports of my projects; the production numbers were measured on the real systems.`
- Boot line (mono, one line, live): prerendered text `booting ruphak.me v3 · node 1 of 1`. After hydrate it becomes, e.g. `FCP 412 ms · retrieval up 530 ms · policy up 544 ms · review up 561 ms · vision standby · 1 node · term 1`. The final token once all lamps are lit: `no backend was harmed; this trace is yours.`
- Quorum prompt: button **"Open this page in a second tab"** (opens `location.href` in `_blank` on click) + hint `or press 2`. Reward line (live region) after a peer joins: `That tab just joined this one over BroadcastChannel. NODES 2. Close whichever tab is leader and the other takes over.` If unsupported: `Your browser does not expose BroadcastChannel or Web Locks, so this tab runs as a single node. Everything else works.`

**Right column (prerendered): Service index** — a ruled list, each row a link to its panel:

| Title (as in data) | Headline metric (as in data) |
|---|---|
| Agentic RAG Document Intelligence | 87% retrieval precision |
| Real-Time Vision Analytics | 94% mAP@0.5 |
| Multi-Tenant RBAC Platform | 120ms query latency, down from 340ms |
| Automated Code Review Pipeline | -45% median PR cycle |

Under the index: `Résumé (HTML) · Résumé (PDF) · Contact`.

**Below both columns: the Board** (S1). Centre: the control-plane relay. Around it: four service lamps labelled with the real project titles (stencil, two lines allowed) and short service names under them (`RETRIEVAL`, `VISION`, `POLICY`, `REVIEW`); a fifth `SENSORS` lamp appears only on devices reporting `DeviceMotionEvent`. The board has an sr-only description: `Switchboard diagram: a control-plane relay in the centre connected by patch cables to lamps for Retrieval, Vision, Policy and Review. Lamps light when each worker is ready; cables pulse when a message passes.`

Board caption (plain on): `Each lamp is a real worker. It lights the moment the worker says it is ready.`

### 3.3 §2 Services — `#services`

Section title: `SERVICES` · lead: `Four projects from my résumé, each running here as an honest port. The numbers on the left were measured on the production systems; the demo on the right runs on your machine, right now.`

Shared panel anatomy (`ServicePanel`, F): stencil label `SERVICE 01` … `04`; H2 = real title; metric row (three metrics from data, display numerals, said once here); stack line; **Depth switch** `30 s · Engineer · Peer` (radio group, default `30s`, `/projects/*` routes default `engineer`); the **Demo** (left) and **Work trace** (right: Decisions / Trade-offs / What broke / What I'd change); the **Schematic** (interactive hand-drawn SVG) under the demo; an honesty stamp (`PORT`, `RULES ONLY`, …) and a one-line honest caption; a `Show me the pipeline` button that animates the real stages with true timings.

#### 3.3a SERVICE 01 — Agentic RAG Document Intelligence (`#service-retrieval`)

Metrics: `87%` retrieval precision · `100K` token corpora · `<2s` p95 latency. Stack: Python · LangChain · FastAPI · PostgreSQL · pgvector · AWS EC2.

Depth copy:
- **30s:** `I built a retrieval system that answers questions over documents of up to 100K tokens and shows where every answer came from. It reached 87% retrieval precision and answered in under two seconds at p95, for more than 50 people at once.`
- **Engineer:** `A multi-agent RAG pipeline on LangChain and GPT-4 over 100K-token corpora. Chunks are 512-token sliding windows; pgvector with HNSW indexing does the nearest-neighbour pass, cosine-similarity reranking tightens it, and structured citation metadata keeps every answer grounded. The FastAPI service runs horizontally scaled on AWS EC2 behind an ALB for more than 50 concurrent sessions. The result: 87% retrieval precision, sub-2 s p95, and a 70% reduction in manual document analysis time.`
- **Peer:** `Agents split a question into retrieval sub-goals; each sub-goal queries pgvector (HNSW) and reranks by cosine before synthesis, with citation metadata carried through so the answer can be audited back to the chunk. Adaptive 512-token sliding windows were the lever that moved precision: fixed chunks cut tables and clauses in half. Horizontal FastAPI replicas behind an ALB kept p95 under 2 s at 50+ concurrent sessions.`

Work trace **[OWNER REVIEW]**:
- Decisions: `Sliding windows over fixed blocks; HNSW over exact search once the corpus passed what a brute-force scan could return inside the p95 budget; citations carried as structured metadata rather than parsed back out of the answer.`
- Trade-offs: `Overlapping windows mean more vectors to store and embed. I paid that cost to stop losing facts at chunk boundaries, which is where the precision was leaking.`
- What broke: `Answers without citations looked right and were wrong. Making the citation metadata mandatory in the pipeline, not optional, is what made the 87% measurable at all.`
- What I'd change: `Measure precision per document type, not just overall; the number hides variance between prose and tables.`

Demo copy: label `ASK THE SITE` · placeholder `What did Ruphak do with pgvector?` · suggestion chips: `What broke in the RBAC project?`, `How was latency variance reduced?`, `Which cloud did Neural Inverse use?`.
Honest caption (always visible): `A port, not the production system. Retrieval and citation run entirely in your browser over this page's own text. Production used 512-token windows and pgvector; this port uses 256-wordpiece windows with 64 overlap because the in-browser encoder's effective context is 256, and BM25 or MiniLM embeddings instead of pgvector. No LLM, no API: retrieval and grounding are the demonstrable part.`
Tier-1 tap label: `Load the embedding model — 23 MB model + 14 MB runtime, once, cached on this device`. Stage names for "Show me the pipeline": `tokenize → embed (or BM25) → score → rerank → cite`.
Schematic nodes (click for depth copy): `ingest`, `chunk (512-token windows)`, `pgvector HNSW`, `agents`, `rerank (cosine)`, `citations`.

#### 3.3b SERVICE 02 — Real-Time Vision Analytics (`#service-vision`)

Metrics: `<30ms` inference · `94%` mAP@0.5 · `30` sustained FPS. Stack: Python · YOLOv8 · OpenCV · React.js · Prometheus · WebSockets.

- **30s:** `I built a live object-detection pipeline that turns camera frames into streaming analytics. It detects in under 30 ms per frame at 94% mAP@0.5 and keeps a steady 30 frames per second on screen.`
- **Engineer:** `YOLOv8 fine-tuned on a 5K-image custom dataset, with bounding-box telemetry streamed over WebSockets and per-class analytics rendered in React.js at a sustained 30 FPS. An asyncio producer–consumer queue between capture and inference reduced latency variance by 40%. Inference p95, detection rate and queue depth are instrumented in Prometheus with SLO alerts.`
- **Peer:** `The queue is the design: capture produces, inference consumes, and a bounded buffer with drop-oldest backpressure keeps the consumer fed without letting latency pile up — that is where the 40% variance reduction came from. Telemetry leaves the process as WebSocket frames, and the three SLOs (inference p95, detection rate, queue depth) alert in Prometheus so a regression shows up as a page, not a feeling.`

Work trace **[OWNER REVIEW]**:
- Decisions: `A bounded producer–consumer queue instead of back-to-back capture and inference; SLO alerts on the three numbers that actually describe health.`
- Trade-offs: `Dropping frames under load keeps latency flat but lowers the detection rate; the alerts watch both so neither is silently traded away.`
- What broke: `Latency variance, not mean latency, was the problem users felt: the mean was fine while the tail stuttered. The queue fixed the tail.`
- What I'd change: `Export the per-class analytics as a Prometheus histogram too, so the dashboard and the alerts read from the same source.`

Demo copy: button `Use my camera` · consent text (native dialog): `This runs YOLOv8n inside your browser. Frames never leave your device; nothing is uploaded or stored. The camera stops when you scroll away or press Stop.` · secondary: `Or drop an image` · tertiary (if clip present): `Or run the recorded clip (4 s, filmed by me)`.
Phone extra: `Shake the phone: motion events feed the same queue as frames, so you can watch backpressure engage.`
Gauges (three, the same SLOs as production): `inference p95 (ms)`, `queue depth`, `dropped frames`.
Honest caption: `A port. YOLOv8n int8 at 320 px runs single-threaded in WebAssembly here; the production system ran a fine-tuned YOLOv8 at <30 ms. Your numbers are your device's numbers.` If the device sustains < 30 FPS the readout says `your device: 19 FPS` beside the unchanged production `30 sustained FPS` metric; the production claim is never rewritten or dimmed.
Tap label: `Load the detector — 3.5 MB model + 14 MB runtime, once, cached`.
Schematic nodes: `camera`, `queue (bounded)`, `YOLOv8`, `WebSocket`, `React analytics`, `Prometheus`.

#### 3.3c SERVICE 03 — Multi-Tenant RBAC Platform (`#service-policy`)

Metrics: `200+` concurrent users · `120ms` query latency · `0` cross-tenant leaks. Stack: React.js · Node.js · PostgreSQL · JWT · Azure App Service · Docker.

- **30s:** `I built a task platform where many companies share one system and none can see another's data. It held 200+ people at once with zero cross-tenant leaks across more than 10,000 policy checks per session, and I cut query time from 340 ms to 120 ms.`
- **Engineer:** `Role-based access control with JWT authentication, row-level PostgreSQL policies and per-tenant audit logging. Load-tested with more than 200 concurrent users: zero cross-tenant leakage across 10K+ policy evaluations per session. Query latency fell from 340 ms to 120 ms by removing N+1 patterns and adding tenant-scoped composite indexes; connection-pool reuse was tuned to keep latency stable in bursts.`
- **Peer:** `Tenant isolation is enforced twice: the JWT carries the tenant claim, and row-level policies in PostgreSQL refuse rows from any other tenant even if application code gets it wrong. Every evaluation writes an audit line keyed by tenant. The 340→120 ms came from two changes: collapsing N+1 query fans into joins, and composite indexes that lead with tenant_id so the planner stays inside one tenant's slice.`

Work trace **[OWNER REVIEW]**:
- Decisions: `Enforce isolation in the database with row-level policies, not only in application checks; audit per tenant from day one.`
- Trade-offs: `Row-level policies add a predicate to every query; the tenant-scoped composite indexes are what kept that predicate cheap.`
- What broke: `Queries were taking 340 ms. The cause was N+1 fans and indexes that did not lead with the tenant; fixing both took it to 120 ms.`
- What I'd change: `Run the cross-tenant fuzz in CI on every change, the way this page runs it in your browser.`

Demo copy: label `POLICY PLAYGROUND` · selectors `Tenant`, `Role`, `Resource`, `Action` · result stamp `ALLOW` (cobalt) / `DENY` (vermilion) · tape header `AUDIT LOG (what the production system would write)` · button `Fuzz it: 10,000 cross-tenant evaluations` · result line: `0 cross-tenant leaks · 10,000 evaluations · {n} evals/s · p95 {x} ms · verified in your browser just now`.
Honest caption + stamp `PORT`: `A TypeScript port of the policy logic. In production the same rules were enforced by PostgreSQL row-level policies and JWT claims; the 200+ user figure is from the production load test, not from this fuzz.`
Chaos tie-in button inside the panel: `Pull the plug mid-fuzz` → see §3.4.
Schematic nodes: `JWT`, `API (Node.js)`, `policy evaluator`, `row-level policies`, `audit log`, `tenant-scoped indexes`.

#### 3.3d SERVICE 04 — Automated Code Review Pipeline (`#service-review`)

Metrics: `80%` routine review automated · `-45%` median PR cycle · `<3m` pipeline time. Stack: Python · LLM APIs · GitHub Actions · Docker · ESLint · Semgrep.

- **30s:** `I built a pipeline that reviews every pull request automatically and posts comments inline. It took over 80% of routine review work for a 12-engineer team, cut the median PR cycle by 45%, and runs in under three minutes.`
- **Engineer:** `A GitHub Actions workflow evaluates every PR diff and posts inline feedback. Findings are classified across OWASP Top-10, logic bugs, performance, style and maintainability into five severity tiers. Structured LLM review is combined with ESLint and Semgrep inside a Dockerized stage. Result: 80% of routine review overhead automated across a 12-engineer repository, median PR cycle down 45%, pipeline under 3 minutes.`
- **Peer:** `The LLM stage emits structured findings, not prose, so they merge with ESLint and Semgrep output into one tiered list and one set of inline comments. Five tiers decide what blocks a merge and what is advisory; keeping the Docker stage under three minutes is what made engineers leave it on.`

Work trace **[OWNER REVIEW]**:
- Decisions: `Structured output from the LLM so it can be merged with deterministic tools; five tiers so severity is a decision, not a vibe; Docker so the stage is reproducible.`
- Trade-offs: `A tighter time budget means fewer rules per run; under three minutes was the budget that kept the pipeline on in every PR.`
- What broke: `Unstructured review text could not be deduplicated against ESLint and Semgrep, so the same issue was reported three ways. Structured findings fixed it.`
- What I'd change: `Track precision per tier over time so false positives in the lower tiers can be pruned with evidence.`

Demo copy: label `REVIEW A SNIPPET` · textarea placeholder `Paste JavaScript here, or pick a seeded diff` · seeds `express-route.js`, `async-worker.js`, `profile-card.jsx` · pipeline stage names: `parse → lint patterns → AST pass → tier → post`.
Honest caption + stamp `RULES ONLY`: `Rules only. The production pipeline added an LLM stage; here the Semgrep-style rules and a small AST pass run entirely in your browser. Five tiers, same shapes.`
Tier names for the port: `T1 Critical ◆`, `T2 High ▲`, `T3 Medium ●`, `T4 Low ■`, `T5 Info ○` (shape + label, never colour alone).
Schematic nodes: `PR diff`, `GitHub Actions`, `Docker stage`, `ESLint`, `Semgrep`, `LLM (structured)`, `tier`, `inline comments`.

### 3.4 §3 Chaos Lab — `#chaos-lab`

Title `CHAOS LAB` · lead: `Three experiments. Buttons only; nothing runs until you press it. Each one ends by telling you exactly what you just proved.`

1. **Pull the plug** — button label `Pull the plug on policy-b`. Plain caption: `This stops one of the policy workers for real, in the middle of a job. Watch the job move to the other worker.` Reward line: `You just killed a worker. The scheduler retried the job on {sibling} — retry {n}, recovered in {ms} ms. That is failover, on a static page.`
2. **Open me in another tab** — button `Open a second tab`. Reward: `Two tabs, one cluster. They found each other over BroadcastChannel and agree on the leader: {leaderId}, term {term}.`
3. **Close the leader** — instruction `Close the tab marked LEADER (it is {this tab / the other tab}).` Reward in surviving tabs: `Leader lost. {nodeId} took the lock and became leader; term is now {term}. Every remaining tab was told.`

Completion stamp: `CERTIFIED OPERATOR` + line `All three done. The Experiments lab link in the Colophon is now lit (it was always reachable at /experiments/; nothing here is gated).`
Sound caption (if sound on): `Relay clicks are synthesized in your browser; there are no audio files.`

### 3.5 §4 Deploy History — `#deploy-history`

Title `DEPLOY HISTORY` · lead: `Roles as releases. Dates exact.`

Releases (ordered list, newest first):
- `v2026.06` **AWS Student Builder Campus Leader** — Amazon Web Services — `Jun 2026 - Jul 2026`. Note: `Selected to lead Builder Center adoption on campus. I designed structured onboarding across EC2, S3 and Lambda and worked with AWS program managers on cloud education.` Stack diff: `+ Builder Center, + EC2, + S3, + Lambda`.
- `v2025.09` **Google Student Ambassador** — Google — `Sep 2025 - Feb 2026`. Note: `I designed and delivered cloud computing and machine learning workshops, reaching more than 300 students through live, project-based demonstrations of Firebase, TensorFlow and Google Cloud.` Proof: `300+ students reached`. Stack diff: `+ Firebase, + TensorFlow, + Google Cloud`.
- `v2022.09` **Chief Development Officer, Co-Founder** — Neural Inverse — `Sep 2022 - Sep 2024`. Note: `I architected an automated image-tagging pipeline on Azure Cognitive Services and Azure SQL and led backend and system architecture decisions across client-facing products.` Proof: `10,000+ records managed`. Stack diff: `+ Azure Cognitive Services, + Azure SQL`.

Education (same ledger, tag `EDU`): `B.E. Computer Science and Engineering — KPR Institute of Engineering and Technology, Coimbatore — 2024 - 2028 — CGPA 8.5/10`.
Certifications and practice (tag `CERT`, each exactly once on the site): `AZ-900 — Microsoft Azure, 2024` · `DP-700 — Microsoft Fabric, 2026` · `LeetCode: 400+ problems solved, 1850 rating`.

### 3.6 §5 Manifest — `#manifest`

Title `MANIFEST` · note: `This section is rendered from /profile.json. Agents read the same file. There is also /llms.txt and a no-JS HTML résumé at /resume/.` Button `View as agent` (flips to syntax-coloured JSON) · copy buttons for the three URLs.

Prose lines (one per group, items verbatim from `skillGroups`):
- `Languages — Java, Python, C++, JavaScript, TypeScript, SQL.`
- `Frameworks and libraries — React.js, Node.js, FastAPI, LangChain, OpenCV, REST APIs, WebSockets.`
- `Cloud and DevOps — AWS EC2, AWS S3, AWS Lambda, AWS ALB, Microsoft Azure, Docker, GitHub Actions, CI/CD.`
- `AI and ML — Machine Learning, Generative AI, Agentic AI, RAG Pipelines, LLM Applications, Computer Vision.`
- `Data and tools — PostgreSQL, MySQL, Azure SQL, Redis, pgvector, Prometheus, Git, Postman, Linux.`

### 3.7 §6 Contact + Résumé — `#contact`

Title `CONTACT` · line: `Email is best.` · `ruphakv@gmail.com` (link + Copy button with aria-live `Email copied`) · `LinkedIn` (https://linkedin.com/in/ruphakvarmaa) · `GitHub` (https://github.com/RuphakVarmaa) · `Résumé: HTML (/resume/) · PDF (/Ruphak-Varmaa-Resume.pdf)`. **No phone number is rendered** (see §10). No form.

`/resume/` page: name, identity line, email, LinkedIn, GitHub, website; Projects (title, stack, three metrics, details verbatim); Experience (role, org, period, description, proof); Education; Certifications and LeetCode (once); Skills. Print stylesheet: A4, 12 pt, ink on white, links printed as URLs. Buttons: `Print`, `Download PDF`.

### 3.8 §7 Colophon — `#colophon`

`v3 · 2026 · rebuilt from a blank file.` Build trace (from the prerender step and live telemetry): initial HTML bytes, CSS bytes, each JS chunk gz size, font bytes, model and runtime sizes, the CSP verbatim, the device tier chosen and the reasons, the live telemetry panel (TTFB, FCP, LCP, worker ready times, frame budget, dropped frames, model bytes). Lines: `Designed and drawn by hand (SVG), set in Big Shoulders, Atkinson Hyperlegible Next, Martian Mono and Doto. No generated imagery. The cluster — scheduler, quorum, chaos lab — was built for this site; source: {repo URL}.` Links: `Experiments (/experiments/)`, `Making-of (repo README)`, `Changelog` (hash-linkable entries: `v3.0 — 2026 — rebuilt as a running cluster`; `v2 — 2025 — WebGL hero`; `v1 — 2024`). All preference toggles repeated here.

`/experiments/`: index of small live pieces — the scheduler trace viewer, the quorum peer table, the BM25 index explorer, the meter test bench. Reachable always; the Chaos stamp only "lights" the link.

### 3.9 Changes to `src/data/portfolio.ts` (F owns; copy fields only)

- Keep every existing field and value. Add to `Project`: `serviceId: 'retrieval' | 'vision' | 'policy' | 'review'`, `headlineMetric: string` (exact strings from §3.2 table), `route: string`. Rename nothing. Remove nothing. `phone` stays in data but is not rendered anywhere and not emitted to JSON-LD/profile.json (§10).
- All first-person prose (depth copy, work traces, captions, chaos lines, colophon) goes in `src/data/copy.ts` keyed by `serviceId`/section, typed with `satisfies`. Data files must use only erasable TypeScript syntax (no enums, namespaces, parameter properties) because build scripts import them under Node type-stripping.

---

## 4. Interaction and motion per section

### 4.0 Global modes

- `html[data-motion='lite']` or `prefers-reduced-motion: reduce`: no boot self-draw (board renders final state), no cable pulses, lamps switch instantly, needles set instantly, Flip disabled (instant reflow), telemetry batched to one update per 500 ms, all state changes announced via the live region. Demos still run (they are computation, not motion).
- `html[data-machine='off']` ("Skip the machine"): the Board, footer strip and Chaos Lab collapse to plain lists (`<ul>` of services with status words); everything else unchanged. Also forced by Basic tier.
- `html[data-plain='on']` (default on first visit): plain captions visible; `off` hides them. Independent of depth.
- Depth `30s | engineer | peer` (global default `30s`; stored `ruphak-depth`; `/projects/*` default `engineer` unless stored).
- Tier `full | standard | basic` (§6.4): Standard caps board updates at 30 fps and uses BM25 only unless the visitor taps; Basic = Skip-the-machine on, static schematics, BM25, no camera.
- Keyboard: `p / r / c` rail; `2` opens a second tab; `?` shows the key sheet (native dialog); `Esc` closes dialogs and stops the camera; Tab order = reading order. Keys are ignored while typing in inputs/textareas.

### 4.1 Control Room

- Board = inline SVG `viewBox="0 0 1200 720"` with `aria-hidden="true"`; the sr-only description sits beside it. Lamps are real HTML `<button>`s positioned over the SVG (`.board` is `position: relative`; `.lamp-button` absolute at percentage coordinates from the shared `LAMP_POSITIONS` constant in `lamp-positions.ts`). Do not use `<foreignObject>` or `<g role="button">`: real buttons get native keyboard and screen-reader behaviour for free.
- Lamp positions (percent of board box, centre): control plane `(50, 50)`; retrieval `(18, 28)`; vision `(82, 28)`; policy `(18, 76)`; review `(82, 76)`; sensors `(50, 90)` (phones only).
- Boot: cables draw with `stroke-dasharray` = path length, `stroke-dashoffset` → 0 over 900 ms (`--ease-out`), staggered 90 ms per cable. Lamp lights at the real `ready` event (CSS class toggle, `--dur-1`). The relay's contact arm throws (rotate 18° and back, `--dur-1`, `--ease-relay`) on every `postMessage` in either direction, driven by the scheduler's `message` event, never a timer.
- Hover/focus lamp → its cable gets `.cable--hot` (stroke `--live`) while a message is in flight on that service; otherwise cobalt.
- Click/Enter on lamp → `document.getElementById('service-…').scrollIntoView({behavior: motionLite ? 'auto' : 'smooth'})` and focus moves to the panel heading.
- Render loop: none. There is no rAF loop on the board; updates are event-driven. The frame-budget sampler (telemetry) runs only while the board is intersecting ≥ 10 % and stops otherwise.
- Readout `NODES n · TERM t`: Doto; updates from `useQuorum()`; a 120 ms `--live` flash on change.
- "Open this page in a second tab": `window.open(location.href, '_blank', 'noopener')`. If `window.open` returns null, show `Your browser blocked the pop-up; duplicate the tab manually.`

### 4.2 ServicePanel (shared behaviour)

- Depth switch = `<fieldset role="radiogroup">` of three radios; change → GSAP `Flip` of the panel's copy region (`--dur-2`) or instant under lite.
- "Show me the pipeline": the schematic's nodes light in sequence as real `progress` messages arrive with `stage` names; each stage shows its measured ms; under lite the list fills instantly on completion.
- Schematic nodes are `<button>`s (same overlay technique as lamps) opening a native `<dialog>` with the node's copy at the current depth; focus returns to the node on close.
- Demo-area lazy loading: the demo chunk loads when the panel is within 50 % of the viewport (`IntersectionObserver`, `rootMargin: 50%`). Model/runtime bytes **never** load without a tap unless tier is `full` AND `connection.saveData !== true` AND `effectiveType` is `4g`/undefined AND the panel is in view — and even then only the 3.5 MB detector, never the 23 MB encoder.
- Fallback content (what the prerendered HTML and Basic tier show): the static schematic, the honest caption, and the recorded trace if one exists at `/traces/<service>.json`. If no recorded trace exists, show `No recorded run published yet.` Never invent numbers.

### 4.3 Retrieval

- Input → `scheduler.submit('retrieval.search', {query, mode})`. Worker returns top-5 `{chunkId, score, bm25, cosine?, text, anchor, window:{start,end}}` with stage timings.
- Result card ("stamped index card"): the cited chunk text, scores in mono, the window brackets drawn as overlapping brackets over a miniature of the page outline (an SVG of 12 rules; the cited window highlighted in `--live-soft`). Clicking a citation scrolls natively to `#anchor` and applies `.cited` (2 px `--live` underline for 4 s).
- Tier 1 only after tap: worker fetches `/models/minilm/model_quantized.onnx` with progress (bytes), then `/ort/ort-wasm-simd-threaded.wasm` via ORT; `telemetry.recordModelBytes`. Cosine over precomputed `/retrieval/embeddings.json`; if that file is absent, the worker embeds the chunks on first use (≤ 60 chunks) and reports it.
- Empty query → suggestion chips. No results above threshold (BM25 score < 0.5 or cosine < 0.25) → `Nothing on this page matches that well. Try one of the suggestions.`

### 4.4 Vision

- Consent via native `<dialog>` (`Allow camera` / `Not now`). `getUserMedia({video:{facingMode:'environment', width:{ideal:640}}})`; phones prefer the rear camera with a flip button. Stream stops (`track.stop()`) on Stop, on `Esc`, when the panel leaves the viewport, and on `visibilitychange`. The video element shows a 1-bit dithered canvas, not the raw feed, and a visible `LIVE` lamp while capturing.
- Pipeline: main-thread producer grabs frames at ≤ 15 Hz via `requestVideoFrameCallback` (fallback rAF) into an `ImageBitmap`, pushes into a **bounded ring buffer (capacity 4, drop-oldest)** in `src/lib/queue/ring.ts` (S3); consumer sends one frame at a time (transfer) to the vision worker; the worker letterboxes to 320×320, runs ORT, applies NMS (IoU 0.45, conf 0.25), returns boxes. Gauges: p95 of the last 60 inferences, current queue depth, dropped count; sustained FPS = completed inferences per second over 3 s.
- DeviceMotion producer (phones; iOS requires `DeviceMotionEvent.requestPermission()` on a tap): each motion sample is enqueued as a zero-cost job on the same ring buffer with `kind:'vision.motion'`; shaking fills the buffer faster than the consumer drains → queue-depth needle rises, drops increment, "backpressure engaged" stamp appears while depth ≥ 3.
- Boxes: cobalt stencil brackets (four corner strokes, not full rectangles), class name in Martian Mono, confidence as two digits.
- No camera / Basic / unsupported SIMD: drop-an-image path still works if the model loads; otherwise recorded trace or `No recorded run published yet.`

### 4.5 Policy

- Four selectors (native `<select>`), result stamp updates on change (no submit button). The audit tape appends one line per evaluation; aria-live polite, throttled to one announcement per 800 ms.
- Fuzz: `scheduler.submit('policy.fuzz', {n: 10000, seed})`; the policy service has a pool of two workers (`policy-a`, `policy-b`); the scheduler splits the fuzz into 10 batches of 1000 and distributes them across the pool; results merge (leaks, evals/s, p95 computed from per-batch timings); the panel shows per-batch progress on a 10-segment meter.
- "Pull the plug mid-fuzz" = `scheduler.pullThePlug('policy', 1)`: terminates `policy-b`; in-flight batches on it fail with `terminated`, are requeued with `attempts+1`, run on `policy-a` (and on the respawned `policy-b` once ready); the tape prints `retry 1 · batch 7 → policy-a · recovered in {ms} ms`.

### 4.6 Review

- Textarea (max 20 KB) or seed buttons. Submit → `review.analyze`. Output: a galley diff with line numbers in the margin; findings as marginalia with the tier stamp shape + label + rule id + one-line fix. The pipeline timeline shows measured ms per stage.
- If acorn fails to parse (TypeScript/JSX/syntax error): the AST stage shows `skipped: not parseable as JavaScript`; pattern rules still run.

### 4.7 Chaos Lab

- Breaker panel: three large switches (buttons, ≥ 44 px). A term counter (Doto) increments on election. Node lamps for each known peer (`nodeId`, `LEADER` tag). Sound: relay click per message when enabled; 55 Hz hum while this tab is leader; descending two-tone on failover.
- Completion stored in `localStorage['ruphak-operator']='v3'`; announced once.

### 4.8 Deploy History, Manifest, Contact, Colophon

- Deploy History: `<ol>`; each `<li>` has a `<details>` for the note; "diff" toggle shows the stack diff line. No motion.
- Manifest: "View as agent" toggles `<pre>` with the actual `/profile.json` text fetched from the same origin (proves the claim); copy buttons use `navigator.clipboard` with aria-live.
- Contact: copy email (existing pattern retained). Colophon: telemetry rows are `<details>`; changelog entries have ids.

---

## 5. Fast path for recruiters

- Prerendered HTML paints name, identity sentence, the four real project titles with a headline metric each, Résumé (HTML + PDF) and Contact links **before any JS**. Target FCP < 400 ms on broadband desktop, < 1.2 s on emulated Fast 3G.
- Quick-view rail on every route: `Projects · Résumé · Contact`, keys `p / r / c`.
- `/resume/` is a prerendered HTML page with print CSS; the PDF stays at `/Ruphak-Varmaa-Resume.pdf`.
- "Skip the machine" (header + colophon, also forced by reduced-motion and Basic tier) turns the page into a crisp one-pager.
- Every panel opens at the 30-second depth: three metrics, stack, one paragraph.
- Nothing is gated. Every section has an id and the four projects have routes with their own `<title>`, description, canonical and OG tags.
- All controls are native elements; the entire site is operable with a keyboard and readable with no canvas: the only `<canvas>` on the site is the Vision dither surface, which has `role="img"` and an aria-label that updates with the detection summary.

---

## 6. Technical architecture

### 6.1 Dependencies

Runtime (exact pins; all published ≥ 2 weeks before 2026-10-11, satisfying `minimumReleaseAge`; none use `eval`):

| Package | Version | Published | Why |
|---|---|---|---|
| `react`, `react-dom` | 19.2.8 (keep) | — | — |
| `gsap` | 3.15.0 (keep) | — | boot draw, Flip, needle |
| `@gsap/react` | 2.1.2 (keep) | — | `useGSAP` |
| `onnxruntime-web` | **1.30.0** | 2026-09-14 | on-origin WASM inference (retrieval encoder, YOLOv8n). Import the slim entry `onnxruntime-web/wasm`. No WebGPU/WebGL/JSEP entries. |
| `acorn` | **8.18.0** | 2026-07-28 | AST pass for the review rules; zero deps; no eval |
| `@fontsource-variable/big-shoulders` | 5.3.0 | 2026-07-19 | display |
| `@fontsource-variable/big-shoulders-stencil` | 5.3.0 | 2026-07-19 | labels |
| `@fontsource-variable/atkinson-hyperlegible-next` | 5.3.0 | 2026-07-19 | text |
| `@fontsource-variable/martian-mono` | 5.3.0 | 2026-07-19 | mono |
| `@fontsource-variable/doto` | 5.3.0 | 2026-07-19 | readouts |

Removed: `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`, `@fontsource-variable/manrope`, `@fontsource-variable/jetbrains-mono`, `@phosphor-icons/react`.
Dev deps: unchanged. No test runner package: `node --test`. No router. No CSS framework. `@huggingface/transformers` is **not** used (it drags `sharp` and a dev build of ORT); tokenization is a 90-line WordPiece in `src/lib/retrieval/wordpiece.ts` with the vocab at `public/models/minilm/vocab.txt`.
`deploy.yml`: bump `node-version` to `24` (type-stripping scripts need ≥ 22.18; 24 is current LTS). Keep all SHA pins.

### 6.2 package.json scripts (F)

```json
{
  "dev": "node scripts/build-corpus.ts --out public/retrieval && vite",
  "build": "tsc -b && node scripts/build-corpus.ts --out public/retrieval && vite build && vite build --ssr src/prerender/entry-server.tsx --outDir dist-ssr --emptyOutDir && node scripts/prerender.mjs && node scripts/embed-corpus.mjs && node scripts/check-budgets.mjs",
  "lint": "eslint .",
  "test": "node --test \"src/**/*.test.ts\" \"scripts/**/*.test.mjs\"",
  "csp:hash": "node scripts/csp-hash.mjs",
  "ort:copy": "node scripts/copy-ort.mjs",
  "preview": "vite preview",
  "check": "pnpm lint && pnpm test && pnpm build"
}
```

`public/retrieval/` and `public/ort/` are generated (`.gitignore`: `public/retrieval/`, `public/ort/`, `dist-ssr/`); `scripts/copy-ort.mjs` copies `ort-wasm-simd-threaded.wasm` + `.mjs` from `node_modules/onnxruntime-web/dist/` into `public/ort/` and runs as `postinstall`.
Vite config: `build.manifest: true` (the Colophon reads chunk sizes), `build.target: 'es2022'`, `cssMinify: 'lightningcss'`, `worker.format: 'es'`, `build.rollupOptions.output.manualChunks` not needed (dynamic imports split).

### 6.3 CSP

Current meta CSP stays byte-identical except two deliberate edits (F):
1. The inline pre-paint IIFE changes (adds `data-machine`, `data-plain`, removes the compact→lite rule), so its sha256 must be recomputed with `pnpm csp:hash` (script prints the base64 hash and rewrites the meta in `index.html`). The prerender step must copy the meta unchanged into every generated HTML file.
2. `'wasm-unsafe-eval'` in `script-src` **only if the spike proves it necessary.** Spike (F, day 1): load ORT in an on-origin module worker under the current CSP in Chrome, Firefox and Safari. Expected: on-origin dedicated worker scripts are governed by their own response headers (none on Pages), not the document's meta CSP, so compilation succeeds. If any browser throws `CompileError`/CSP violation, add exactly `'wasm-unsafe-eval'` and record it in the Colophon's CSP line. Nothing else changes: no new origins, `connect-src 'self'` stays (models and runtime are on-origin).

Workers are created as `new Worker(new URL('../workers/x.worker.ts', import.meta.url), { type: 'module' })` so Vite emits them as on-origin files (`worker-src 'self' blob:` already allows this).

### 6.4 Device tiering (`src/cluster/tier.ts`, F)

Runs once in `main.tsx` before any lazy chunk; result stored on `html[data-tier]` and in the store.

```
simd      = WebAssembly.validate(SIMD_PROBE_BYTES)      // v128.const probe
cores     = navigator.hardwareConcurrency ?? 2
memGB     = navigator.deviceMemory ?? 4
saveData  = navigator.connection?.saveData === true
slowNet   = ['slow-2g','2g','3g'].includes(navigator.connection?.effectiveType)
reduce    = matchMedia('(prefers-reduced-motion: reduce)').matches
benchMs   = time of a fixed 40 ms-target integer loop (200k iterations of a xorshift), measured once
tier = 'full'
if (!simd || cores <= 2 || memGB <= 2 || benchMs > 120) tier = 'standard'
if (!('Worker' in window) || benchMs > 400 || (saveData && !simd)) tier = 'basic'
reasons[] records every rule that fired, in plain words ("2 CPU cores", "no WASM SIMD", "data saver on")
override: localStorage['ruphak-tier'] ∈ {full,standard,basic} (set from the Colophon)
```

`standard`: board updates coalesced to 30 fps; vision at 10 Hz capture; retrieval BM25 unless tapped. `basic`: `data-machine='off'`, no camera, no model taps, static schematics + recorded traces.

### 6.5 Cluster: scheduler, workers, quorum, telemetry (F)

`src/cluster/protocol.ts` (exact; sections must not edit, only consume):

```ts
export type ServiceId = 'retrieval' | 'vision' | 'policy' | 'review'
export type NodeId = string            // `${service}-${letter}` e.g. 'policy-b'

export type JobKind =
  | 'retrieval.warm' | 'retrieval.search' | 'retrieval.loadModel'
  | 'vision.warm' | 'vision.loadModel' | 'vision.detect' | 'vision.motion'
  | 'policy.evaluate' | 'policy.fuzz'
  | 'review.analyze'

export interface JobPayload {
  'retrieval.warm': { corpusUrl: string }
  'retrieval.search': { query: string; mode: 'bm25' | 'embed'; topK: number }
  'retrieval.loadModel': { modelUrl: string; wasmBase: string; embeddingsUrl?: string }
  'vision.warm': Record<string, never>
  'vision.loadModel': { modelUrl: string; wasmBase: string; inputSize: 320 }
  'vision.detect': { bitmap: ImageBitmap; ts: number }
  'vision.motion': { ax: number; ay: number; az: number; ts: number }
  'policy.evaluate': { tenant: string; actorTenant: string; role: Role; resource: Resource; action: Action; resourceTenant: string }
  'policy.fuzz': { n: number; seed: number; batch: number }
  'review.analyze': { source: string; filename: string }
}
export interface JobResult {
  'retrieval.warm': { chunks: number; terms: number }
  'retrieval.search': { hits: Hit[]; stages: Stage[] }
  'retrieval.loadModel': { bytes: number; dim: number; chunksEmbedded: number }
  'vision.warm': { ok: true }
  'vision.loadModel': { bytes: number }
  'vision.detect': { boxes: Box[]; inferMs: number; ts: number }
  'vision.motion': { ts: number }
  'policy.evaluate': { allow: boolean; policy: string; audit: string; us: number }
  'policy.fuzz': { evaluated: number; leaks: number; p95us: number; totalMs: number; sample: string[] }
  'review.analyze': { findings: Finding[]; stages: Stage[]; parsed: boolean }
}
export type Role = 'owner' | 'admin' | 'member' | 'viewer'
export type Resource = 'project' | 'task' | 'audit-log' | 'billing'
export type Action = 'read' | 'write' | 'delete' | 'share'
export interface Stage { name: string; ms: number }
export interface Hit { chunkId: string; anchor: string; text: string; bm25: number; cosine?: number; window: { start: number; end: number } }
export interface Box { x: number; y: number; w: number; h: number; cls: string; conf: number }
export interface Finding { ruleId: string; tier: 1 | 2 | 3 | 4 | 5; line: number; endLine?: number; message: string; fix: string; stage: 'pattern' | 'ast' }

export type ToWorker =
  | { type: 'job'; id: string; kind: JobKind; payload: unknown }
  | { type: 'cancel'; id: string }
  | { type: 'ping'; at: number }
export type FromWorker =
  | { type: 'ready'; node: NodeId; at: number }
  | { type: 'progress'; id: string; stage?: string; pct?: number; bytesLoaded?: number; bytesTotal?: number }
  | { type: 'result'; id: string; result: unknown }
  | { type: 'error'; id: string; message: string; retryable: boolean }
  | { type: 'log'; level: 'info' | 'warn'; text: string }
  | { type: 'pong'; at: number }
```

`src/cluster/scheduler.ts` (F) exports:

```ts
export interface JobHandle<K extends JobKind> { id: string; kind: K; promise: Promise<JobResult[K]>; cancel(): void }
export interface SubmitOptions { onProgress?: (p: Extract<FromWorker, {type:'progress'}>) => void; timeoutMs?: number; transfer?: Transferable[]; maxAttempts?: number /* default 3 */ }
export const scheduler: {
  ensureService(service: ServiceId): Promise<void>            // spawns pool lazily (pool size: policy 2, others 1)
  submit<K extends JobKind>(kind: K, payload: JobPayload[K], opts?: SubmitOptions): JobHandle<K>
  pullThePlug(service: ServiceId, index?: number): { node: NodeId; inFlight: string[] }   // terminate(); respawn; requeue
  getState(): ClusterState
  subscribe(listener: () => void): () => void                 // for useSyncExternalStore
  onMessage(listener: (dir: 'in' | 'out', service: ServiceId, msg: ToWorker | FromWorker) => void): () => void  // drives relay/cable motion + audio
}
export interface ClusterState {
  nodes: Record<NodeId, { service: ServiceId; status: 'spawning' | 'ready' | 'busy' | 'dead'; spawnedAt: number; readyAt?: number; jobs: number }>
  queue: Array<{ id: string; kind: JobKind; attempts: number; node?: NodeId }>
  spans: Array<{ id: string; kind: JobKind; node: NodeId; start: number; end?: number; attempts: number; outcome?: 'ok' | 'error' | 'terminated' | 'timeout'; recoveredMs?: number }>
  lastEvent?: string   // human sentence, e.g. "retry 1 · batch 7 → policy-a · recovered in 38 ms"
}
```

Scheduler rules: FIFO with per-service queues; a job runs on the first `ready` node of its service; on `error.retryable`, `terminated`, or timeout, requeue with `attempts+1` up to `maxAttempts`, then reject; `recoveredMs` = time from failure to the retried job's result; after `terminate()` the scheduler respawns the same NodeId after 0 ms and marks `dead` until `ready`. Spans are kept to the last 200. `lastEvent` sentences are the ones printed on tapes and announced.

`src/cluster/worker-host.ts` (F): `createWorker(service, index)` from the registry in `src/cluster/registry.ts` (F; four fixed `new URL` paths); handshake: worker must post `{type:'ready'}` within 10 s or is marked dead; `ping/pong` every 5 s only while the board is visible.

`src/workers/_base.ts` (F): `defineWorker<Handlers>(node: NodeId, handlers)` wiring `self.onmessage`, `progress(id, …)`, errors → `{type:'error', retryable}`; sections implement handlers per JobKind only.

`src/cluster/quorum.ts` (F):

```ts
export interface QuorumState { supported: boolean; nodeId: string; term: number; leaderId: string | null; isLeader: boolean; peers: Array<{ id: string; lastSeen: number; isLeader: boolean }>; nodes: number }
export const quorum: { start(): void; stop(): void; getState(): QuorumState; subscribe(l: () => void): () => void; openSecondTab(): boolean }
```

Protocol on `BroadcastChannel('ruphak-cluster')`: `HELLO{id, startedAt}` on start → peers reply `HELLO`; `HEARTBEAT{id, term, leaderId}` every 1000 ms; `LEADER{id, term}` on lock acquisition; `BYE{id}` on `pagehide`. Peer expiry 3500 ms. Election: `navigator.locks.request('ruphak-cluster-leader', { mode: 'exclusive' }, () => new Promise(() => {}))`; on acquisition `term = max(knownTerm) + 1` then broadcast `LEADER`. The resolved callback is never returned so the lock is held until the tab closes. `supported = 'BroadcastChannel' in window && 'locks' in navigator`; otherwise single node with `supported:false`. In `/resume/` the quorum does not start.

`src/cluster/telemetry.ts` (F): `PerformanceObserver` for `paint`, `largest-contentful-paint`, `longtask`, `resource`; `performance.mark('worker:<node>:spawn' | ':ready')`; `recordModelBytes(service, loaded, total)`; frame sampler (rAF deltas, dropped = delta > 34 ms, runs only while the board intersects); `getSnapshot()` → `{ ttfb, fcp, lcp, workers, models, frames: { avgMs, dropped, fps }, longTasks, resources: [{name, bytes, ms}] }`; `useTelemetry()` hook. Nothing is transmitted anywhere.

`src/cluster/store.ts` (F): `useClusterState<T>(selector: (s: ClusterState) => T): T` and `useQuorum()` via `useSyncExternalStore` with a server snapshot (empty state) so prerender is deterministic.

`src/cluster/live-region.ts` (F): `announce(text, politeness = 'polite')` throttled to 1 per 800 ms with coalescing; `<LiveRegion/>` component in App.

`src/cluster/audio.ts` (F): Web Audio synth only. `audio.setEnabled(bool)` (creates `AudioContext` on first user gesture), `click()` (5 ms noise burst through a 2 kHz bandpass, −18 dB), `humStart()/humStop()` (55 Hz sine + 110 Hz at −30 dB, 300 ms fade), `failover()` (880→440 Hz, 180 ms). Clicks are rate-limited to 20/s.

### 6.6 Retrieval pipeline (S2) — concrete

- `scripts/build-corpus.ts` (runs under Node type-stripping; imports `../src/data/portfolio.ts`, `../src/data/copy.ts`, `../src/lib/retrieval/wordpiece.ts`): flattens every rendered sentence of the home page into `{sectionId, anchor, text}` records in reading order, concatenates per section, tokenizes with WordPiece (`vocab.txt`, lowercase, `[CLS]`/`[SEP]` excluded from the count), and cuts **256-wordpiece windows with stride 192** (64 overlap), never crossing a section boundary. Output `public/retrieval/corpus.json`: `{ model: 'bm25+minilm', window: 256, overlap: 64, chunks: [{ id, sectionId, anchor, text, tokens, start, end }] }`. Determinism: same input → byte-identical output (sorted keys).
- BM25 (`src/lib/retrieval/bm25.ts`): k1 = 1.2, b = 0.75, built in the worker at `retrieval.warm`; query tokenized by the same WordPiece; score reported raw.
- Embeddings: `scripts/embed-corpus.mjs` runs only if `public/models/minilm/model_quantized.onnx` exists; uses `onnxruntime-web` (wasm backend under Node, `numThreads 1`) with the same tokenizer, mean pooling over the attention mask, L2 normalisation, writes `dist/retrieval/embeddings.json` `{ model: 'all-MiniLM-L6-v2 q8', dim: 384, sha256, vectors: Float32 base64 per chunk id }`. Parity test `scripts/parity.test.mjs` embeds 5 fixed sentences and compares against `src/lib/retrieval/parity-fixture.json` (generated once by the browser path via `/experiments/` → "export parity fixture"): cosine ≥ 0.999.
- Model files (owner provides; S2 documents the exact commands in `public/models/README.md`): `all-MiniLM-L6-v2` exported to ONNX and dynamically quantized to int8 (`model_quantized.onnx`, ≈ 23 MB) + `vocab.txt` (bert-base-uncased, Apache-2.0 attribution in the README). Until present, the tap button is hidden and the panel says `Embedding model not published yet; BM25 is live.`
- Worker (`src/workers/retrieval.worker.ts`): `retrieval.warm` fetches corpus, builds BM25; `retrieval.search` returns top-K with stage timings; `retrieval.loadModel` streams the model with progress, creates the ORT session (`executionProviders: ['wasm']`, `env.wasm.wasmPaths = wasmBase`, `env.wasm.numThreads = 1`, `env.wasm.simd = true`), loads or computes chunk embeddings.

### 6.7 Vision pipeline (S3) — concrete

- Model: `public/models/yolov8n/yolov8n-320.onnx` (owner exports with `yolo export model=yolov8n.pt format=onnx imgsz=320 opset=17`, then static int8 quantization with `onnxruntime.quantization.quantize_static` on 100 calibration images → target ≈ 3.5 MB; if accuracy is visibly poor, ship fp16 ≈ 6.3 MB). `metadata.json` beside it: `{ inputSize: 320, bytes, sha256, quant: 'int8' | 'fp16', classes: [...80 COCO names] }`. Absent → the tap is hidden and the panel offers the recorded trace / drop-image message.
- Worker: letterbox to 320×320 (paper-grey padding), NCHW float32 0–1, output `[1, 84, 2100]` → decode → NMS (IoU 0.45, conf 0.25, max 50). Returns boxes in source-image coordinates and `inferMs` from `performance.now()` around `session.run`.
- Recorded trace: produced only by a real run with `?record=1` on the owner's device (`/traces/vision.json`: `{ device, date, frames: [{ t, boxes, inferMs, depth, dropped }] }`); S3 implements the recorder and the player; fabricating a trace is forbidden.
- Clip: `public/media/desk.mp4` ≤ 1.5 MB, H.264, 4 s, filmed by the owner; absent → option hidden.

### 6.8 Policy engine (S4) — concrete

`src/lib/policy/engine.ts` pure, deterministic:
- Tenants `A | B | C`. Roles ordered `viewer < member < admin < owner`.
- Rule 0 (row-level): if `actorTenant !== resourceTenant` → `DENY policy=rls.tenant`. Always first.
- `project`: read ≥ viewer; write ≥ member; share ≥ member; delete ≥ admin.
- `task`: read ≥ viewer; write ≥ member; share ≥ member; delete ≥ member.
- `audit-log`: read ≥ admin; write/delete/share → DENY `policy=audit.immutable`.
- `billing`: read ≥ admin; write ≥ owner; delete → DENY; share → DENY.
- Audit line: `{iso} tenant={t} actor=u_{hash}(role={role}) action={action} resource={resource}:{id} → {ALLOW|DENY} policy={policy}`.
- Fuzz: seeded xorshift; 50 % of cases cross-tenant; a *leak* is any ALLOW where `actorTenant !== resourceTenant`. Must report 0 by construction (the test suite asserts this and the panel measures it live anyway).

### 6.9 Review rules (S4) — concrete

`src/lib/review/rules.ts` (pattern rules, regex over lines) + `src/lib/review/ast.ts` (acorn, `ecmaVersion: 'latest'`, `sourceType: 'module'` then `'script'` fallback, `locations: true`, custom recursive walker):

| Rule id | Tier | Stage | Detects |
|---|---|---|---|
| sec.eval | 1 | ast | `eval(…)`, `new Function(…)` |
| sec.sql-concat | 1 | pattern | SQL keyword string concatenated with `+`/template `${}` containing `req.`/`params`/`query`/`body` |
| sec.exec-interp | 1 | pattern | `exec(`/`execSync(` with a template literal |
| sec.secret | 1 | pattern | `AKIA[0-9A-Z]{16}`, `sk-[A-Za-z0-9]{20,}`, `password\s*=\s*['"]` |
| sec.innerhtml | 2 | ast | assignment to `.innerHTML` with a non-literal RHS |
| logic.unawaited | 2 | ast | call to an identifier ending in `Async`/returning `fetch(`/`.then` not awaited inside an async function (expression statement) |
| logic.assign-in-cond | 2 | ast | `AssignmentExpression` as an `if`/`while` test |
| logic.unreachable | 2 | ast | statements after `return`/`throw` in the same block |
| perf.nested-indexof | 3 | ast | `indexOf`/`includes` inside a loop nested in another loop |
| perf.await-in-loop | 3 | ast | `await` inside `for`/`while` body |
| perf.json-clone | 3 | pattern | `JSON.parse(JSON.stringify(` |
| style.var | 4 | ast | `var` declarations |
| style.loose-eq | 4 | ast | `==`/`!=` except against `null` |
| style.console | 4 | pattern | `console.log(` |
| maint.long-fn | 5 | ast | function body > 60 lines |
| maint.params | 5 | ast | > 4 parameters |
| maint.todo | 5 | pattern | `TODO`/`FIXME` |

Seeds (S4 writes them; each must trigger ≥ 3 rules across ≥ 3 tiers): `express-route.js` (SQL concat, exec interp, console, var), `async-worker.js` (unawaited, await-in-loop, nested indexOf, todo), `profile-card.jsx` (innerHTML, loose-eq, long function, params).

### 6.10 Prerender (F) and agent files (S6)

- `src/prerender/entry-server.tsx` exports `render(route: RouteMatch): { html: string; head: HeadData }` using `renderToString` from `react-dom/server`, and re-exports `buildAgentFiles(buildInfo)` from `src/prerender/agent-files.ts` (S6).
- `scripts/prerender.mjs`: reads `dist/index.html` (the Vite output) as the template; for each route writes the HTML into `<div id="root" data-prerendered="1">…</div>` plus `<title>`, `<meta name="description">`, canonical, `og:*`, `twitter:card=summary_large_image`, `og:image=https://www.ruphak.me/og.png`; writes `dist/404.html` = home; writes `dist/profile.json`, `dist/llms.txt`, `dist/sitemap.xml` from `buildAgentFiles`; writes `dist/build-info.json` (chunk sizes from `dist/.vite/manifest.json` + gz sizes computed with `node:zlib`, font and model sizes, CSP string) which the Colophon fetches. Removes `dist/.vite/`.
- `src/main.tsx`: `hydrateRoot` when `data-prerendered` is present, else `createRoot`. Components must be SSR-safe: no `window`/`document` at module scope; preferences and quorum/telemetry snapshots are empty on the server and synced in effects; any text that differs between server and client (readouts, boot line) renders the prerendered placeholder first and updates after mount (`useEffect`), never in the initial render.
- `scripts/check-budgets.mjs` fails the build if a budget in §8.1 is exceeded.
- `og.png` (S6): a committed 1200×630 PNG rendered by hand from the style frame (export from the browser via the `/experiments/` "render OG" page or any screenshot of `docs/og.html`); no generated imagery.

### 6.11 Component tree

```
<App route>
  <PreferencesProvider>                       F
    <SkipLink/> <LiveRegion/>                 F
    <Header rail readout toggles/>            F  (src/components/shell/Header.tsx)
    route = home:
      <main id="content">
        <ControlRoom/>                        S1 (src/sections/control-room/index.tsx) — hero + <Board/> + boot line + quorum prompt
        <Services>                            F  (src/sections/services/index.tsx: section wrapper + 4 panels in order)
          <RetrievalService/>                 S2 (src/sections/services/retrieval/index.tsx) — uses <ServicePanel/> from F
          <VisionService/>                    S3
          <PolicyService/>                    S4
          <ReviewService/>                    S4
        <ChaosLab/>                           S5
        <DeployHistory/> <Manifest/> <Contact/> <Colophon/>   S6
      </main>
      <ClusterStrip/>                         F  (sticky footer strip: nodes · term · uptime; hidden under data-machine=off)
    route = project: <main><Service of id (depth engineer)/></main><ClusterStrip/>
    route = resume: <ResumePage/>             S6 (src/pages/ResumePage.tsx), no quorum, no strip
    route = experiments: <ExperimentsPage/>   S5 (src/pages/ExperimentsPage.tsx)
```

Shared UI primitives (F, `src/components/ui/`): `Button`, `Icon`, `Stamp`, `Tape` (mono list on ruled paper; `aria-live` optional), `Meter` (SVG analog meter; props `{label, value, min, max, unit, warn?: number}`; needle tween via GSAP, instant under lite), `Readout` (Doto), `Schematic` (props `{title, desc, nodes: SchematicNode[], edges: [from,to][], active?: string[], onNode?: (id) => void, depth}` — renders a hand-drawn SVG with overlay buttons and the node dialog), `DepthSwitch`, `PlainCaption`, `ServicePanel` (props `{ project: Project; copy: ServiceCopy; demo: ReactNode; fallback: ReactNode; schematic: SchematicProps; stamp: 'PORT' | 'RULES ONLY'; stages?: Stage[]; onShowPipeline?: () => void }`), `ConsentDialog`, `Section` (`{id, label, title, lead, children}`).

Routing: `src/routes.ts` (F): `matchRoute(pathname): { kind: 'home' } | { kind: 'project'; id: ServiceId } | { kind: 'resume' } | { kind: 'experiments' } | { kind: 'notfound' }`; `ROUTES` table with path, title, description, og. No client-side router; links are plain `<a href>`.

---

## 7. File ownership map

Rule: **F runs first and alone.** F creates every file it lists and, in addition, creates 10–20-line placeholders for the *entry files* listed under S1–S6 (section `index.tsx` files, the four `*.worker.ts` files, `agent-files.ts`, the two pages) so that `pnpm check` is green when F merges. After F merges, those placeholders belong exclusively to the listed section workstream and F never edits them. S1–S6 run in parallel and touch only their listed files. No file appears in two lists. New files inside an owned directory belong to that owner. Shared changes needed in F-owned files are requested as `// SPEC-GAP` comments plus a note in the PR description, not edited directly.

### F — FOUNDATION (serial, first; ~2 days)

Files (creates/edits):
- `index.html`, `package.json`, `pnpm-workspace.yaml`, `vite.config.ts`, `tsconfig.app.json` (add `"erasableSyntaxOnly": true`), `tsconfig.node.json` (include `scripts`), `eslint.config.js` (add globals: `Worker`, `BroadcastChannel`, `PerformanceObserver`, `performance`, `AudioContext`, `ImageBitmap`, `createImageBitmap`, `self`, `WebAssembly`, `fetch`, `URL`, `console`, `setTimeout`, `clearTimeout`, `crypto`; ignore `dist-ssr`, `public`), `.gitignore`, `.github/workflows/deploy.yml` (node 24), `README.md` (making-of skeleton)
- `src/main.tsx`, `src/App.tsx`, `src/routes.ts`, `src/vite-env.d.ts`
- `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/utilities.css` (delete `globals.css`)
- `src/data/portfolio.ts` (schema additions §3.9), `src/data/copy.ts` (ALL prose from §3, keyed; review seeds are NOT here, they belong to S4)
- `src/cluster/protocol.ts`, `scheduler.ts`, `worker-host.ts`, `registry.ts`, `quorum.ts`, `telemetry.ts`, `tier.ts`, `store.ts`, `live-region.ts`, `audio.ts`, `scheduler.test.ts`, `quorum.test.ts` (unit tests with fake workers/channels)
- `src/workers/_base.ts`
- `src/lib/draw/wobble.ts`, `src/lib/draw/paths.ts` (rounded-rect, bracket, lamp, relay, cable helpers returning `d` strings)
- `src/components/shell/Header.tsx`, `ClusterStrip.tsx`, `SkipLink.tsx`, `LiveRegion.tsx`, `KeySheet.tsx`, `Preferences.tsx`, `preferences-context.ts`, `PreferenceControls.tsx`, `shell.module.css`
- `src/components/ui/Button.tsx`, `Icon.tsx`, `Stamp.tsx`, `Tape.tsx`, `Meter.tsx`, `Readout.tsx`, `Schematic.tsx`, `DepthSwitch.tsx`, `PlainCaption.tsx`, `ServicePanel.tsx`, `ConsentDialog.tsx`, `Section.tsx`, `ui.module.css`
- `src/sections/services/index.tsx` (the Services section wrapper that orders the four panels)
- `src/prerender/entry-server.tsx`, `scripts/prerender.mjs`, `scripts/check-budgets.mjs`, `scripts/csp-hash.mjs`, `scripts/copy-ort.mjs`
- Deletes: `src/components/{HeroScene,IntroCurtain,ProjectArtwork,ProjectDialog,ProjectReel,ProofRail,Reveal,StackSection,CredentialsSection,ExperienceSection,Footer,Hero,Header,Preferences,PreferenceControls,preferences-context}.tsx|ts`, `src/styles/globals.css`

Responsibilities: everything in §2, §3.9, §4.0, §6.1–6.5, §6.10–6.11; the CSP spike (§6.3) with the result written into `docs/CSP_SPIKE.md`; placeholders for section entries; a green `pnpm check` with the home route prerendered (placeholders render their section title and all facts from data at minimum).

Acceptance: `pnpm check` green; `dist/index.html` contains name, identity sentence, four titles + headline metrics, résumé and contact links in the body; `scheduler.test.ts` proves retry-on-terminate with `recoveredMs`; `quorum.test.ts` proves term monotonicity with a fake channel; tokens render both themes with ≥ 7:1 text contrast; `pnpm csp:hash` output matches the meta; no `three` in the lockfile.

### S1 — CONTROL ROOM (hero + board)

Files: `src/sections/control-room/index.tsx`, `ControlRoom.module.css`, `Board.tsx`, `BoardSvg.tsx` (the switchboard drawing), `Lamp.tsx`, `Relay.tsx`, `Cables.tsx`, `BootLine.tsx`, `ServiceIndex.tsx`, `QuorumPrompt.tsx`, `useBoardMotion.ts`, `lamp-positions.ts`, `docs/style-frame.html`, `docs/USER_TESTS.md`.

Consumes from F: `useClusterState`, `useQuorum`, `useTelemetry`, `scheduler.onMessage`, `quorum.openSecondTab`, `usePreferences` (`motion`, `plain`, `machine`), `projects` + `copy.controlRoom`, `wobble`, `paths`, `Readout`, `PlainCaption`, `Button`, `announce`, `audio`.

Responsibilities: §3.2 and §4.1 in full; the style frame first (static HTML + the SVG, reviewed by two non-engineers — record quotes and the two fixes made in `docs/USER_TESTS.md`); the SENSORS lamp on motion-capable devices; the collapsed list under `data-machine='off'`.

Acceptance: prerendered hero contains all §3.2 facts; lamps are real buttons, Tab-reachable, with `:focus-visible` rings; relay throws only on `onMessage`; boot line shows real ms values; readout updates within 1.2 s of a second tab opening; no rAF loop running when the board is off-screen (verified in the Performance panel); reduced motion renders the final board state with no transitions.

### S2 — SERVICE: RETRIEVAL

Files: `src/sections/services/retrieval/index.tsx`, `Retrieval.module.css`, `AskTheSite.tsx`, `IndexCard.tsx`, `WindowBrackets.tsx`, `ModelTap.tsx`, `src/workers/retrieval.worker.ts`, `src/lib/retrieval/wordpiece.ts`, `bm25.ts`, `chunker.ts`, `embed.ts`, `cosine.ts`, `wordpiece.test.ts`, `bm25.test.ts`, `chunker.test.ts`, `parity-fixture.json`, `scripts/build-corpus.ts`, `scripts/embed-corpus.mjs`, `scripts/parity.test.mjs`, `public/models/README.md`, `public/models/minilm/vocab.txt`, `public/models/minilm/.gitkeep`.

Consumes from F: `ServicePanel`, `Schematic`, `Tape`, `Stamp`, `Button`, `scheduler.submit/ensureService`, `telemetry.recordModelBytes`, `getTier`, `usePreferences`, `defineWorker`, `projects[0]`, `copy.services.retrieval`, `announce`.

Responsibilities: §3.3a, §4.3, §6.6. The `chunker` must be importable by both the build script and the worker (no DOM).

Acceptance: `pnpm dev` and `pnpm build` generate `corpus.json` deterministically; query "pgvector" returns the chunk containing "pgvector HNSW" as hit 1 with a citation that scrolls to and underlines it; stage timings are real; tier-1 path works when the model is present and hides when absent; parity test passes when the model is present and is skipped (not failed) when absent; the honest caption with the 256/512 sentence is always visible.

### S3 — SERVICE: VISION

Files: `src/sections/services/vision/index.tsx`, `Vision.module.css`, `CameraStage.tsx`, `Dither.ts` (Bayer pass), `Gauges.tsx`, `MotionProducer.ts`, `Recorder.ts`, `TracePlayer.ts`, `src/lib/queue/ring.ts`, `ring.test.ts`, `src/lib/vision/letterbox.ts`, `decode.ts`, `nms.ts`, `nms.test.ts`, `coco-classes.ts`, `src/workers/vision.worker.ts`, `public/models/yolov8n/.gitkeep`, `public/models/yolov8n/README.md`, `public/media/.gitkeep`, `public/traces/.gitkeep`.

Consumes from F: `ServicePanel`, `Schematic`, `Meter`, `Stamp`, `Button`, `ConsentDialog`, `scheduler`, `telemetry.recordModelBytes`, `getTier`, `usePreferences`, `defineWorker`, `projects[1]`, `copy.services.vision`, `announce`.

Responsibilities: §3.3b, §4.4, §6.7.

Acceptance: camera never starts without the dialog's `Allow`; stream stops on Stop/Esc/off-screen/hidden tab (track `readyState === 'ended'` verified); frames are transferred, not copied; ring buffer drop-oldest proven by `ring.test.ts`; gauges show measured values; the production `30 sustained FPS` metric is unchanged while `your device: N FPS` shows the measured number; on a phone, shaking raises queue depth and shows the backpressure stamp; with no model file the panel degrades honestly.

### S4 — SERVICES: POLICY + REVIEW

Files: `src/sections/services/policy/index.tsx`, `Policy.module.css`, `Playground.tsx`, `FuzzMeter.tsx`, `src/lib/policy/engine.ts`, `fuzz.ts`, `engine.test.ts`, `fuzz.test.ts`, `src/workers/policy.worker.ts`, `src/sections/services/review/index.tsx`, `Review.module.css`, `Galley.tsx`, `Marginalia.tsx`, `Pipeline.tsx`, `seeds.ts`, `src/lib/review/rules.ts`, `ast.ts`, `walk.ts`, `tiers.ts`, `rules.test.ts`, `ast.test.ts`, `src/workers/review.worker.ts`.

Consumes from F: `ServicePanel`, `Schematic`, `Tape`, `Meter`, `Stamp`, `Button`, `scheduler.submit/ensureService/pullThePlug`, `useClusterState`, `usePreferences`, `defineWorker`, `projects[2]`, `projects[3]`, `copy.services.policy`, `copy.services.review`, `announce`.

Responsibilities: §3.3c, §3.3d, §4.5, §4.6, §6.8, §6.9. The policy pool size (2) is configured in F's registry; S4 only uses it.

Acceptance: `engine.test.ts` covers every rule in §6.8 including the cross-tenant deny; fuzz of 10,000 completes in < 1.5 s on a 2020 laptop and reports 0 leaks, evals/s and p95; "Pull the plug mid-fuzz" prints a real retry line with `recoveredMs` and the fuzz still completes with 10,000 evaluations; each seed triggers ≥ 3 rules across ≥ 3 tiers; tiers show shape + label; non-JS input skips the AST stage with the stated message.

### S5 — CHAOS LAB + EXPERIMENTS + SOUND UI

Files: `src/sections/chaos-lab/index.tsx`, `ChaosLab.module.css`, `Breaker.tsx`, `NodeLamps.tsx`, `TermCounter.tsx`, `RewardLine.tsx`, `useOperatorStamp.ts`, `src/pages/ExperimentsPage.tsx`, `Experiments.module.css`, `src/pages/experiments/TraceViewer.tsx`, `PeerTable.tsx`, `IndexExplorer.tsx`, `MeterBench.tsx`, `ParityExport.tsx`, `OgRender.tsx`, `src/components/shell/SoundToggle.tsx`.

Consumes from F: `scheduler` (`pullThePlug`, `submit('policy.fuzz')`, `subscribe`, `onMessage`), `quorum`, `useQuorum`, `useClusterState`, `audio`, `usePreferences` (`sound`), `Readout`, `Stamp`, `Button`, `Tape`, `Meter`, `copy.chaos`, `announce`, `routes`.

Responsibilities: §3.4, §4.7, the `/experiments/` page (§3.8), the sound toggle's UI (the synth lives in F), the operator stamp.

Acceptance: each experiment ends with its reward line (exact copy from §3.4 with live values); killing `policy-b` during a running fuzz yields a real `recoveredMs`; opening a second tab shows 2 node lamps within 1.2 s; closing the leader increments the term in the surviving tab and announces it; the stamp persists in `localStorage` and is announced once; sound is off by default, starts only on a gesture, and emits no network requests; reduced motion = instant state + live region.

### S6 — RECORD: DEPLOY HISTORY, MANIFEST, CONTACT, COLOPHON, RÉSUMÉ, AGENT FILES, OG

Files: `src/sections/deploy-history/index.tsx`, `DeployHistory.module.css`, `src/sections/manifest/index.tsx`, `Manifest.module.css`, `src/sections/contact/index.tsx`, `Contact.module.css`, `src/sections/colophon/index.tsx`, `Colophon.module.css`, `BuildTrace.tsx`, `TelemetryPanel.tsx`, `Changelog.tsx`, `src/pages/ResumePage.tsx`, `Resume.module.css`, `src/styles/print.css`, `src/prerender/agent-files.ts`, `agent-files.test.ts`, `docs/og.html`, `public/og.png`, `public/robots.txt`, `public/sitemap.xml` (removed: generated by prerender), `public/security.txt` (keep; update `Expires` only if past).

Consumes from F: `Section`, `Stamp`, `Button`, `Icon`, `Tape`, `useTelemetry`, `getTier`, `usePreferences` (all toggles + `PreferenceControls`), `profile`, `experience`, `skillGroups`, `highlights`, `projects`, `copy.{deployHistory,manifest,contact,colophon,resume}`, `routes`, `announce`.

Responsibilities: §3.5–3.8 (except `/experiments/`), §4.8, `buildAgentFiles(buildInfo) → { profileJson, llmsTxt, sitemapXml }` (profile.json: name, shortName, email, linkedin, github, website, degree, institution, educationPeriod, cgpa, projects (all fields), experience, skillGroups, highlights, routes; **no phone**), the HTML résumé with print CSS, the OG image.

Acceptance: LeetCode and certification facts appear exactly once on `/`; "View as agent" shows the real `/profile.json` fetched from origin; `/resume/` prints to one or two A4 pages with no cut lines; `og.png` is 1200×630 and referenced by every route; `agent-files.test.ts` asserts every project metric string and every experience period appears in `llms.txt`; Colophon build trace lists every chunk with gz size and the CSP verbatim; no phone number anywhere in `dist/`.

---

## 8. Budgets, accessibility, browser support

### 8.1 Performance budgets (enforced by `scripts/check-budgets.mjs`)

| Item | Budget |
|---|---|
| `dist/index.html` (prerendered) | ≤ 60 KB raw |
| Critical CSS (all CSS, one file) | ≤ 24 KB gz |
| Initial JS (`index-*.js`: React + shell + cluster + board) | ≤ 95 KB gz |
| Fonts (5 latin woff2) | ≤ 150 KB total |
| Any section demo chunk | ≤ 35 KB gz each (retrieval, vision, policy, review, chaos, experiments) |
| ORT runtime JS chunk (shared) | ≤ 60 KB gz |
| acorn chunk | ≤ 40 KB gz |
| Model bytes | encoder ≤ 24 MB, detector ≤ 6.5 MB, ORT wasm 14.24 MB — only ever on tap (detector may auto-load on `full` tier + 4g + no saveData + panel in view) |
| Total transferred before interaction, no taps | ≤ 450 KB |
| FCP | < 400 ms desktop broadband; < 1.2 s Fast 3G emulation |
| LCP | the H1 text; < 1.0 s desktop, < 2.0 s Fast 3G |
| CLS | 0 (fonts metric-matched; readouts have fixed widths with `ch` units) |
| Frame rate | 60 fps desktop; ≥ 30 fps on a mid-range Android (4× CPU throttle) with the board visible; vision capture ≤ 15 Hz full / 10 Hz standard |
| DPR cap | canvases (dither, OG render) at `min(devicePixelRatio, 2)` |
| Long tasks | none > 50 ms on the main thread from site code during boot (all inference in workers) |

### 8.2 Accessibility (verified with VoiceOver + Safari and NVDA + Firefox)

- Skip link; one `<h1>`; `aria-labelledby` on every section; heading order never skips.
- All controls are native `<button>`, `<a>`, `<input>`, `<select>`, `<textarea>`, `<dialog>`, `<details>`; `aria-pressed` on toggles; `role="radiogroup"` for depth; `:focus-visible` 2 px `--focus` ring with 2 px offset; `Esc` closes dialogs and returns focus to the trigger.
- Board: SVG `aria-hidden`; sr-only description; lamps are buttons with names `"Retrieval — Agentic RAG Document Intelligence — ready"` updating with status.
- Live region: one polite region, throttled; events announced: worker ready, leader change, fuzz complete, plug pulled, email copied, stamp earned.
- Severity and allow/deny conveyed by shape + text, never colour alone. Contrast ≥ 7:1 for all text in both themes; `--live` never carries text < 18 px.
- `prefers-reduced-motion`, `prefers-reduced-transparency` (no translucency anyway), `prefers-color-scheme` honoured; `forced-colors: active` keeps outlines via `outline` not `box-shadow`.
- Touch targets ≥ 44×44 px; no long-press hijack; no `user-scalable=no`.
- No-JS: the prerendered DOM has every fact, static schematics with `<title>`/`<desc>`, working links; demos show their fallback content.
- The only `<canvas>` (Vision) has `role="img"` and an aria-label summarising detections (`"3 objects detected: person, cup, laptop"`).

### 8.3 Browser and device support

- Chrome/Edge ≥ 120, Firefox ≥ 120, Safari ≥ 16.4 (iOS 16.4+): full. BroadcastChannel + Web Locks supported in all; feature-detect anyway and degrade to single node with the honest note.
- WASM SIMD required for ORT 1.30 (it ships only the SIMD build); no SIMD → tier `standard` with model taps hidden and a one-line reason.
- No `SharedArrayBuffer` (no COOP/COEP on Pages): `numThreads = 1` always.
- Safari: `OffscreenCanvas` not required (letterboxing happens in the worker on `ImageBitmap` via `createImageBitmap` + `OffscreenCanvas` where available, else the main thread resizes before transfer); iOS DeviceMotion permission on a tap; tab suspension handled by peer expiry.
- Private windows: `localStorage` and `navigator.locks` may throw → wrap in try/catch; single-node note.
- Phones are the richest tier (camera + motion); nothing is forced to lite under 768 px.

---

## 9. Definition of Done (Opus reviewer checklist)

Reviewers verify each line against the built `dist/` and a running `pnpm preview`, plus Chrome DevTools (4× CPU, Fast 3G, reduced motion emulation), Safari and Firefox.

**Build and hygiene**
- [ ] `pnpm check` green in CI (lint + test + build + prerender + budgets); Node 24 in `deploy.yml`; all Actions still SHA-pinned.
- [ ] Lockfile contains none of: `three`, `@react-three/*`, `@phosphor-icons/react`, `manrope`, `jetbrains-mono`, `@huggingface/transformers`, `sharp`.
- [ ] Only new runtime deps: `onnxruntime-web@1.30.0`, `acorn@8.18.0`, five `@fontsource-variable/*@5.3.0`. All pass `minimumReleaseAge` without new exclusions.
- [ ] `scripts/check-budgets.mjs` enforces every row of §8.1 and fails on breach.
- [ ] No file edited by two workstreams (git blame per file matches §7).

**Honesty**
- [ ] Every number, date, name and stack string in `dist/` equals `src/data/portfolio.ts`. LeetCode, AZ-900, DP-700 appear exactly once on `/`. No phone number in `dist/`.
- [ ] Each service shows its `PORT`/`RULES ONLY` stamp and the honest caption; the 256-vs-512 window sentence is present; the vision production metric is never dimmed or rewritten by device results.
- [ ] No fabricated traces: `/traces/*.json` either absent (with the "not published yet" line) or produced by the recorder with device/date fields.
- [ ] No generated imagery anywhere; the Colophon states authorship and the cluster-vs-projects distinction.

**It is real**
- [ ] Workers are on-origin module workers; `pullThePlug` calls `terminate()`; the span shows `outcome: 'terminated'` then a retried span with `recoveredMs`.
- [ ] Two tabs show `NODES 2`; closing the leader increments `TERM` in the survivor within 2 s; the live region announces it.
- [ ] Telemetry numbers match the Performance panel (FCP within ±20 ms; worker ready marks present).
- [ ] Retrieval returns cited chunks with real stage timings; the citation scrolls and underlines the paragraph.
- [ ] Fuzz runs 10,000 evaluations with 0 leaks; the sample audit lines are real engine output.
- [ ] Review findings carry correct line numbers on all three seeds.

**Design**
- [ ] Only the five specified fonts load (Network panel); no font CDN; `font-src 'self' data:` unchanged.
- [ ] Palette tokens only; no lime/purple/gradients/grain; `--live` used only for live states; lamps use the quantized glow.
- [ ] Hero first screen at 1440×900 and 390×844 shows: name, identity sentence, four real titles + headline metrics, résumé + contact links, `NODES/TERM` readout, "Open this page in a second tab".
- [ ] No pinning, reels, typewriter, counters, cursor effects, preloader. Motion only on real events (reviewer watches the relay with the Network/worker idle: it must not move).
- [ ] Style frame and `docs/USER_TESTS.md` exist with two non-engineer read-throughs and the resulting copy fixes.

**Fast path**
- [ ] With JS disabled, `/` shows all facts and working links; `/resume/` is complete and prints cleanly.
- [ ] `p / r / c / 2 / ? / Esc` work; nothing fires while typing in an input.
- [ ] Each `/projects/*/`, `/resume/`, `/experiments/` has a correct `<title>`, description, canonical, `og:image` (1200×630), and is listed in `sitemap.xml`; `404.html` boots the SPA.
- [ ] `/profile.json` and `/llms.txt` exist and `agent-files.test.ts` passes; "View as agent" shows the fetched file.

**Accessibility and performance**
- [ ] axe (DevTools) reports 0 serious/critical issues on all routes in both themes.
- [ ] VoiceOver/Safari and NVDA/Firefox: lamps, depth radios, dialogs, tape announcements and the live region behave as §8.2.
- [ ] Reduced motion: board static, no transitions, demos still run, announcements present.
- [ ] Lighthouse (mobile, 4× throttle): Performance ≥ 95, Accessibility 100, Best Practices 100, SEO 100 on `/`.
- [ ] Camera: starts only after the dialog, visibly stops off-screen/Esc/hidden; no frame leaves the device (Network panel shows no uploads).
- [ ] Mid-range Android (or 4× throttle) holds ≥ 30 fps with the board visible; no main-thread long task from inference.

---

## 10. Owner-confirmation items (never silently changed)

1. **Neural Inverse dates** `Sep 2022 - Sep 2024` precede the degree start `2024 - 2028`: kept verbatim; no explanatory note is added unless the owner writes one into `copy.deployHistory.neuralInverseNote`.
2. **Phone number**: present in `portfolio.ts`, rendered nowhere, omitted from JSON-LD and `profile.json`. Owner may re-enable by setting `profile.publishPhone = true` (S6 reads the flag; default `false`).
3. **Email in JSON-LD**: kept (it is public on the page).
4. **Work-trace paragraphs marked [OWNER REVIEW]** in §3.3: drafted from the résumé bullets; the owner edits `copy.ts` if any sentence overstates.
5. **Model files, clip and recorded traces** are owner-provided; the site is complete and honest without them (BM25, drop-image hidden, "not published yet" lines).
6. **Repo URL** for the Colophon source link: `copy.colophon.sourceUrl` (default `https://github.com/RuphakVarmaa`; owner replaces with the exact repository).
7. **Initial JavaScript budget** (added in review round 1). Section 8.1 asks for 95 KB gzipped of initial JS for "React + shell + cluster + board". React alone is 59 KB, so the line cannot hold. The build enforces the site entry (95 KB), the React chunk (62 KB) and their sum (125 KB), a cap the foundation set, not the owner (INTERFACES.md deviation 1). Today the entry is 60.2 KB and the sum 119.1 KB. Owner: accept the 125 KB cap on the sum, or name what to cut (INTERFACES.md deviation 21 says what was tried).
8. **Fast 3G first paint** (added in review round 1). Section 8.1 asks for < 1.2 s on emulated Fast 3G. Measured: 1.8 s (4x CPU, gzip on). Two round trips at 562 ms are most of it; reaching 1.2 s needs the first screen's CSS inlined into the HTML, and the HTML has about 2 KB of room under its 60 KB cap (INTERFACES.md deviation 20). Owner: accept 1.8 s, or raise the HTML cap on purpose.
