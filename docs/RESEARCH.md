# RESEARCH APPENDIX — ruphak.me v3 (2026)

Companion to `REDESIGN_SPEC.md`. Five research sweeps fed this: Hacker News threads (Reddit itself was unreachable; HN threads with 200–1,000+ points stood in), X, Awwwards/FWA/Codrops jury notes and sub-scores, the three.js forum, and a code audit of the current site. Three concepts were written, judged by three independent reviewers, and the winner was revised against every must-fix.

---

## 1. Top portfolios studied

| # | Portfolio | URL | Why it matters |
|---|---|---|---|
| 1 | Bruno Simon — Folio 2025 | https://bruno-simon.com | Genre-defining drivable world; what is still fresh is the shared state (whispers, leaderboard) and the single-shader WebGPU/WebGL pipeline. Also the cautionary tale: no progress bar, 100 % CPU, "a game, not a website". |
| 2 | Dustin Brett — daedalOS | https://dustinbrett.com | OS-in-browser with real apps (v86, DOOM, persistent FS); warmest praise in the 2026 Ask HN; "functionally impractical" by its author. |
| 3 | Henry Heffernan | https://henryheffernan.com | A 3D object that contains a 2D software layer; the CRT skin is now cloned to death. |
| 4 | Mitch Ivin — Windows XP | https://mitchivin.com | 1,032-point Show HN: "entice people to click around" wins attention; borrowed skins cost design credibility; AI-generated graphics made reviewers doubt everything else. |
| 5 | Jesse Zhou — Ramen Shop | https://jesse-zhou.com | One place, fully committed, cheap to run; got a consultant hired as a developer. |
| 6 | Rauno Freiberg | https://rauno.me | Zero WebGL; the micro-interactions are the portfolio. The restraint school. |
| 7 | Stefan Vitasović — Portfolio25 | https://stefanvitasovic.dev | Swiss print + glitch shaders; Dev 8.04 / WPO 8.4; creative without a game. |
| 8 | Elliott Mangham | https://elliott.mangham.dev | Two colours, Vite + vanilla, SOTD + Dev Award; typographic rigor and keyboard hints read as creative to juries. |
| 9 | Corentin Bernadou | https://corentinbernadou.com | Swiss grid, one WebGL geometry carrying every preview; "one idea, tight palette, motion with meaning". |
| 10 | Aurélien Vigne — Grand Theater | https://aurelienvigne.com | Narrative frame + physics toys + a secret page unlocked by puzzles; rewards that never gate facts. |
| 11 | Weisdevice — Xianyao Wei | https://weisdevice.xyz | Raycasts throttled to 30 fps, render loop paused on project pages: 3D that does not melt laptops. |
| 12 | Hot Dogtor — Paulo Pinho | https://www.hotdogtor.com | Three fidelity tiers (WebGPU / WebGL / Basic) + webcam head-tracking. |
| 13 | Aarshdeep Chadha — "You are a request" | https://aarshdeepchadha.vercel.app | A backend engineer making invisible work visible; text first, 3D after; reduced-motion list fallback. Closest existing answer, but simulated. |
| 14 | rollacode | https://rollacode.org | The agent drives the UI through tool calls instead of sitting in a chat box. |
| 15 | Lynn Fisher | https://lynnandtonic.com | Rebuilt yearly from a blank file; resize-as-narrative; constraint + wit + a versioned ritual. |

One-idea mentions: Mathis Biabiany (load-time GPU benchmark → asset tiers), Roi Lagunzad (duotone + stencil + dither), Jay Ransijn (personality via physics), Kuber Mehta (`llms.txt`, `profile.json`, no-JS fallback), MakendranG (click a real architecture node → junior/PM/senior explanation), Maria Vasilyeva and Gionatan Nese (2026 SOTDs: sound design + two-colour restraint), Oliver Brodersen (reward unlocked, nobody understood what — signpost rewards), Harsh Kumar (synthesized Web Audio with zero audio files).

---

## 2. Overused by 2026 (reads as template)

- Drive/walk a 3D island or cozy room (Bruno's folio is open source → clone flood).
- Retro OS skins (XP, Win95, Tiger, CRT desks); "copying a design shows no design skill".
- Scroll-as-film camera tours (half of every 2026 curated list).
- "Chat with my résumé" boxes without tool use, evaluation or grounded citations.
- Browser terminal portfolios.
- "You are an HTTP request" scroll stories — three independent 2026 instances, all simulated.
- Cyberpunk neon rain.
- The Framer/Awwwards-lite starter recipe that ruphak.me v2 is today: dark glass pill nav + grain + tracked display headline + muted lede + pill CTA pair + abstract 3D orb.
- Metric cards / proof rails, bento skill-chip grids, oversized footer slogans, permanent dark mode, purple/lime gradients, "strategic thinker" copy, tech-badge walls.
- Split-curtain preloaders and pinned horizontal project reels.
- Micro-tropes: typewriter text, skill bars, particle backgrounds, custom cursors, liquid hover distortion, animate-everything, 0→80 % counters.
- Manrope + JetBrains Mono + lime on near-black; Fraunces as the "tasteful" serif; Bricolage Grotesque as the "opinionated" sans.
- AI-generated imagery of any kind.

## 3. Fresh / under-exploited (authentic for a backend / distributed-systems / AI engineer)

- **The system actually runs.** Every backend-themed portfolio simulates; nobody makes it real. Real retrieval with citations in a Web Worker, real YOLOv8n on the webcam, real policy evaluation with an audit line, real rule-tiered review — each doubling as the project's artwork.
- **The visitor's own session as honest telemetry** ("no backend was harmed; this trace is yours").
- **Architecture as art direction**: hand-drawn, interactive schematics with adaptive-depth explanations authored by the owner (no LLM needed).
- **Agent-readable by design**: prerendered HTML, `llms.txt`, `profile.json`, HTML résumé, per-section URLs and OG — as the thesis, not a footnote.
- **Cheap novel inputs**: device motion on phones (so the mobile path is the richer one), resize-as-narrative, synthesized Web Audio.
- **Stylized, not photoreal**: duotone, stencil, dither, line-render looks that are cheap and unmistakably designed.
- **A persistent ritual**: version the site, keep a changelog and an `/experiments` lab, open-source with a making-of.
- Shared social state (whispers, leaderboards) is loved on HN but blocked by `connect-src 'self'` on Pages; the quorum concept reinterprets it as same-device multi-tab shared state over BroadcastChannel.

## 4. Community red lines

1. Slow start with no progress indicator. 2. Content gated behind the gimmick. 3. Scrolljacking of any kind. 4. GPU/CPU hogs. 5. Browser/device breakage (Firefox, Safari, iOS long-press). 6. Mobile gets the lesser site. 7. No escape hatch; broken web semantics (empty `<body>`, no per-section URLs, blank OG). 8. Unreadable or sloppy type and layout. 9. Unverifiable projects. 10. Template and AI tells. 11. Copied skins and IP. 12. Unsignposted rewards. 13. Accessibility ignored (the lowest Dev Award sub-score on every 2025–26 portfolio SOTD). 14. Decorative motion with no director behind it.

## 5. Audit of the current site (www.ruphak.me)

KEEP: the content and metrics in `src/data/portfolio.ts`; the accessibility layer (skip link, `aria-labelledby`, native dialog with focus return, focus-trapped menu, `aria-pressed`, `:focus-visible`, reduced-motion and reduced-transparency queries, aria-live copy-email); the preference system (pre-paint IIFE, `PreferencesProvider`, token theming with `color-mix()`); security/SEO/infra (meta CSP, referrer policy, JSON-LD, canonical/OG/robots/sitemap, `security.txt`, SHA-pinned Actions, `pnpm check` gate, self-hosted fonts, strict TS, `minimumReleaseAge`); the lazy chunk pattern.

KILL: the 884 KB R3F orb; the 1.55 s curtain preloader; the pinned reel; the glass pill nav + grain + pill CTA hero; the eyebrow → H2 → lede → cards scaffold; ProofRail, bento chips, credential tiles, footer slogan; slogan copy with no first person; abstract CSS artwork; Manrope + JetBrains Mono + lime; the mobile-gets-nothing lite path.

FIX WITH THE OWNER: Neural Inverse dates (Sep 2022 – Sep 2024) precede the 2024 degree start; "400+ LeetCode" appears three times; phone number public; `theme-color` hard-coded dark; 32 px OG image; empty `#root` for crawlers.

HARD CONSTRAINTS: meta CSP with no external origins (`connect-src 'self'`, `font-src 'self' data:`, `frame-src 'none'`, no eval); any inline-script change needs a new sha256; `worker-src 'self' blob:` and `img-src data: blob:` allow on-origin workers and generated textures; static hosting only (no headers, no redirects); Vite 8 / React 19 / TS 6 strict / pnpm 11 with `minimumReleaseAge`; content must paint before any heavy chunk.

---

## 6. The three concepts

### identity — QUORUM: a portfolio that is a running cluster (WINNER)
The site is a tiny real distributed system in the browser: Web Workers are nodes, tabs form a quorum (BroadcastChannel + Web Locks election with a term counter), the four projects run as honest in-browser ports, "Pull the plug" terminates a real worker and the scheduler reroutes the job, telemetry is the visitor's own session. Drawn as a relay switchboard on warm paper; plain-language captions and a 30 s / engineer / peer depth switch everywhere. No WebGL.

### world — PUMP HOUSE: Ruphak Waterworks, Station No. 3
A tall ink-and-wash cutaway of a pumping station (Coimbatore is India's pump capital); each machine room runs one real project; water moves only when a mechanism is doing work; day-shift paper / night-shift cyanotype theme; gyroscope slosh on phones; a sump unlocked by a valve sequence.

### editorial — GROUND TRUTH: ruphak.me Vol. 3
A light-paper broadsheet where every metric is typeset as a claim at hairline weight and inks to black only when its proof runs in the visitor's browser; the masthead inks when the page's own boot trace completes; RAG results underline the paragraph they retrieved; a Skim / Read / Source density switch.

## 7. Judge scores and why the winner won

Three independent judges (creative director, recruiter-legibility, engineering feasibility), each scoring 0–10. Totals:

```json
{"identity": 23, "world": 18, "editorial": 21.5}
```

| Concept | J1 (creative) | J2 (recruiter) | J3 (feasibility) | Total |
|---|---|---|---|---|
| identity | 8 | 7.5 | 7.5 | **23** |
| editorial | 6.5 | 8 | 7 | 21.5 |
| world | 7.5 | 6 | 4.5 | 18 |

Why identity won:
- It is the only concept with a mechanic nobody has shipped on a portfolio: a verifiable cross-tab cluster with real failover on a static host. The hook is retellable in one sentence ("the portfolio you can fail over"), which is what travels on X, HN and r/webdev, and it proves exactly the skill a backend engineer needs to claim.
- It is the lowest-risk build on the real stack: every cluster mechanic works under the existing CSP with no new origins; dropping WebGL removes the 884 KB orb, the low-end GPU risk and most canvas accessibility risk; the ship order front-loads zero-weight real features so a complete, honest v3 can go live after stage 1.
- The recruiter judge's concerns (jargon before metrics, renamed projects, cluster not on the résumé) were all fixable with copy and layout, and the spec fixes them: real titles with headline metrics above the fold, lamps labelled with real names, telemetry demoted to the Colophon, an explicit authorship line.
- Editorial scored highest on recruiter legibility but its signature mechanic (variable-font weight as verification state) is subtle, reflow-prone, and does not survive a screenshot; its best ideas were grafted: claim-beside-proof layout, "your device: N FPS" beside the untouched production claim, the document citing itself.
- World had the most personal metaphor but the highest risk of shipping half-finished (hand-drawn plates at every breakpoint, three renderers, too many gimmicks); its best ideas were grafted: motion only when a mechanism is doing work, "Try to leak" as the one-click security demo, a theme switch that reads as a print process.

Must-fixes applied to the winner (all binding in the spec): quorum on the first screen with the NODES/TERM readout and the "Open this page in a second tab" prompt; one authored visual language (relay switchboard, Big Shoulders + Stencil, Atkinson Hyperlegible Next, Martian Mono, Doto); real project titles + headline metrics above the fold; honest 256-wordpiece windows with the production 512-token fact beside them; the 14.24 MB ORT WASM budgeted and only ever loaded on a tap; build-time embeddings produced with the identical package and quantized file plus a parity test; a style-frame spike and two non-engineer read-throughs before the board animates; an explicit cluster-vs-projects authorship line.

## 8. Dependency facts verified on 2026-10-11 (npm registry)

- `onnxruntime-web` 1.30.0 (2026-09-14); ships only `ort-wasm-simd-threaded.wasm` (14,239,897 bytes) + loader (24 KB); slim entry `ort.wasm.min.mjs` 50 KB.
- `acorn` 8.18.0 (2026-07-28), zero deps.
- `@huggingface/transformers` 4.3.x depends on `sharp` and a dev build of ORT → not used.
- `@fontsource-variable/{big-shoulders, big-shoulders-stencil, atkinson-hyperlegible-next, martian-mono, doto}` 5.3.0 (2026-07-19), all OFL-1.1; latin wght files 36.5 / 37.3 / 34.0 / 23.6 / 5.4 KB.
- Palette contrast (computed): ink on paper 14.9:1; cobalt on paper 6.75:1 (links only, underlined); vermilion on paper 3.83:1 (marks and ≥ 18 px text only); dark theme ink 14.9:1, cobalt 8.96:1, vermilion 7.2:1, muted 8.4:1.
