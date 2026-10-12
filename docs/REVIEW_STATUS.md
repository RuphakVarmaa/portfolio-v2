# Review status — QUORUM redesign

Final Opus 5.5 (high effort) review, round 3, of commit `b074b4d` on `redesign-2026`. Each finding below was confirmed by two independent Opus verifiers (one reproducing it in headless Chrome, one checking the source). The owner asked to stop after this review, so these are **open, not fixed**.

| Lens | Verdict | Open findings |
|---|---|---|
| creative | changes requested | 1 major, 2 minor |
| craft | changes requested | 1 major, 6 minor |
| recruiter | changes requested | 1 major, 1 minor |
| correctness | approve | 0 major, 2 minor |
| a11y | approve | 0 major, 4 minor |
| mobile | changes requested | 1 major, 4 minor |
| security | approve | 0 major, 1 minor |

History: round 1 found ~34 confirmed issues (fixed in `12f55a9`); round 2 found 26 (fixed in `b074b4d`); round 3 found the items below.

## Major

### [creative] A background-suspended leader is reported as gone: NODES drops to 1, the hero reward line vanishes and the log claims a failover (signature moment 1 fails on phones)
- **Where:** src/cluster/quorum.ts (tick/PEER_EXPIRY_MS=3500, onPageLifecycle only handles pagehide), src/sections/chaos-lab/chaos-store.ts:170-190 ('left (it was the leader)', 'leader lost: … went away'), src/sections/chaos-lab/leader-watch.ts, hero quorum line in src/data/copy.ts:519-525
- **Fix:** Use the lock manager to decide whether a tab is alive, instead of relying only on the heartbeat timer.
(a) In quorum.ts, have each node hold a presence lock `ruphak-node-<id>` for its lifetime. When a peer's heartbeat expires, call navigator.locks.query(). If that peer's presence lock (or, for the leader, LOCK_NAME) is still held, mark the peer `asleep` instead of dropping it, and keep counting it.
(b) Add `asleep` to QuorumState members. Render it as a dimmed, unlit lamp tagged ASLEEP in Chaos Lab, and as 'NODES 2 · 1 asleep' in the masthead and strip.
(c) Change the chaos-store copy to 'tab-x is in the background; its browser paused it (it still holds the lock)'. Log 'left' and 'leader lost' only after a BYE or when the lock is actually released.
(d) Listen to document 'freeze', 'resume' and 'visibilitychange'. Broadcast a SLEEP message on freeze or hidden, and a HELLO on resume.
Add quorum.test.ts cases for 'heartbeat expired but lock held' (stays asleep, no lost event) and 'lock released' (lost, then elected). Done this way, a weakness turns into an honest, distinctive moment.

### [craft] Schematic nodes: hover/lit fill bleeds outside the wobbled ink outline at the corners
- **Where:** src/components/ui/ui.module.css .node (l.~820-900: `border-radius: 8px; background: var(--paper)`, `.node:hover`, `.nodeActive`) with the `--box` mask outline
- **Fix:** Paint the fill with the same path as the outline. Add a filled variant of the outline (`--box-fill`: the same `d`, `fill='%23000'`, no stroke). Set `.node { background: transparent }` and give `.node::before { content:''; position:absolute; inset:0; background: var(--node-fill, var(--paper)); mask: var(--box-fill) 0 0/100% 100% no-repeat; }` with the same nth-of-type mirroring as ::after. Hover and active then set `--node-fill: var(--cobalt-soft)` or `var(--live-soft)`. If the CSS budget is tight, put both layers in one mask: `mask: var(--box-fill)` on ::before and keep ::after as is. That costs one extra data-URI, about 1.1 KB raw and roughly 400 B gzip. Alternatively, inset the background with `background-clip: content-box; padding: 3px` and drop the radius to 6 px so it never reaches the stroke.

### [recruiter] Pull-the-plug caption says the job moves to the other worker, but it is usually retried on the restarted worker itself
- **Where:** src/data/copy.ts (chaos.experiments.plug.plain, chaos.experiments.plug.reward); src/sections/chaos-lab/format.ts:62; src/cluster/scheduler.ts (retry dispatch)
- **Fix:** Choose one option.
(a) Preferred, matches the spec's signature moment: when the scheduler requeues an in-flight job from a node that was unplugged, give it an affinity that avoids the failed NodeId while any sibling in the pool is alive. Queue it for policy-a even if policy-a is busy, rather than letting the respawned policy-b take it the moment it posts ready.
(b) Copy only: make the plain caption honest for both outcomes, e.g. "This stops one of the policy workers for real, in the middle of a job. Watch the scheduler hand that job to a worker that is still up: the other one, or a fresh copy of the one you stopped." When the retry lands on the respawned node, end the reward with "That is recovery, on a static page." instead of "failover".
Either way, add a test asserting the caption and the reward agree for both retry targets.

### [mobile] Lighthouse mobile performance is 0.94, below the spec's 95; FCP 2.0 s and LCP 2.8 s, mostly a full-page layout on the boot path
- **Where:** scripts/prerender.mjs (head and CSS strategy), src/styles/base.css or the section CSS modules, docs/INTERFACES.md §4 and deviation 20, docs/REDESIGN_SPEC.md §10
- **Fix:** Cut the initial layout cost. Add one rule for every top-level home section after #control-room: `content-visibility:auto; contain-intrinsic-size:auto 1200px`. That is about 70 B, so it fits the remaining 137 B of CSS room, and the `auto` keyword keeps CLS at 0 once sections have been rendered. Hash-scroll targets still work. This removes most of the 199 ms and 162 ms Layout passes and the font-swap relayout. If that is not enough, move the below-fold section CSS out of the render-blocking stylesheet: keep tokens, shell, hero and board CSS in the blocking file, and have the existing hashed pre-paint script insert a second stylesheet link. Then re-run Lighthouse 3 times and record the real scores in INTERFACES.md §4. If the score is still under 95, add it to spec §10 next to item 8 as an owner decision, instead of leaving the 98 baseline in place.

## Minor

### [creative] The consent-dialog scrim washes the Ink (dark) theme to a muddy mid-grey
- **Where:** src/styles/base.css:200-202 (dialog::backdrop uses color-mix(var(--ink) 60%))
- **Fix:** Use a theme-aware scrim token. For example, add --scrim: color-mix(in oklab, #1C1B18 55%, transparent) in Paper and --scrim: color-mix(in oklab, #000 60%, transparent) in Ink in tokens.css, and set dialog::backdrop { background: var(--scrim) }.

### [creative] The hero reward line breaks between 'NODES' and its number
- **Where:** src/data/copy.ts:521-525 (quorumPrompt.joined / joinedNew)
- **Fix:** Join the readout with a no-break space, `NODES ${nodes}`, or wrap the readout in a span with white-space:nowrap and the Doto readout face, so the line echoes the masthead.

### [craft] Phone board crowded at 320–390 px: SENSORS plate overlaps the neighbouring glows, top plates misalign, CONTROL PLANE label collides with its frame
- **Where:** src/sections/control-room/lamp-positions.ts (sensors (50,90) and the bottom row), src/sections/control-room/ControlRoom.module.css (.lampItem[data-row='mid'] .plate, plate title rules, relay display label)
- **Fix:** On the narrow (portrait) board, move the relay up to about y 40 and put SENSORS at about (50,64), directly under the relay with its plate to one side, or push the bottom row to about y 86 so the SENSORS halo clears the others. Give both top plates the same height (grid or align-self: stretch with min-height for 3 title lines), or use the short title below 360 px. Reduce the CONTROL PLANE label's letter-spacing or size with cqw below 360 px so it keeps at least 4 px from the display frame.

### [craft] Vision gauges: readouts sit on different baselines; 'recent peak' only under one meter
- **Where:** src/sections/services/vision/Gauges.tsx, src/sections/services/vision/Vision.module.css (gauge row), src/components/ui/Meter.tsx
- **Fix:** Lay the three meters out as a grid with `grid-template-rows: subgrid` (dial / label / value / note), or give the label `min-height: 2lh`, so the values share a baseline. Give every meter a note line, for example 'last 60 passes' / 'recent peak' / 'this session', or reserve the empty row so the row ends evenly.

### [craft] Interaction-state gaps: toggles have no press, pressed toggles no hover, disclosures no hover, hero email hover invisible
- **Where:** src/components/shell/shell.module.css .toggle (l.300-330), src/sections/services/policy/Disclosure.module.css .box summary, src/styles/base.css a:hover / src/sections/contact/Contact.module.css (email link)
- **Fix:** Add `.toggle:active { translate: 1px 1px }` (or the 2 px key press with box-shadow), and give pressed toggles a hover of `background: var(--ink-muted)`, as .variant-primary already does. Add `.box summary:hover { background: var(--paper-3) }`. For the display-size email, scale the hover underline with the type (`text-decoration-thickness: .06em` at rest, `.1em` on hover) or show the cobalt-soft highlight used for selection.

### [craft] Vision camera-blocked state is a dead end
- **Where:** src/sections/services/vision/strings.ts messageText('denied' / 'no-camera' / 'camera-error'), src/sections/services/vision/Controls.tsx
- **Fix:** Denied copy: 'The camera is blocked for this site. Allow it from the camera icon in the address bar, then press Try again.' Relabel the button to 'Try the camera again' after a failure. If the owner agrees, add an honest secondary producer, 'Feed the test card', that pushes frames of the drawn test card through the same capacity-4 drop-oldest ring buffer at 15 Hz. That lets Worker speed (Slow/Stalled) show real backpressure without a camera. Label it clearly as the test card, not as live video.

### [craft] Build trace: small chunk bars render as identical hollow boxes that read as missing-glyph tofu
- **Where:** src/sections/colophon/Colophon.module.css .bar (l.476-482: `width: max(6px, …); height: 10px; border: 1.5px solid`), src/sections/colophon/BuildTrace.tsx
- **Fix:** Draw each bar on a hairline track: a full-width 1 px var(--ink-rule) baseline with the proportional bar sitting on it, height 6 px and minimum width 2 px. Or switch the on-demand bars to a solid 3 px-high stroke, so a floor-size bar reads as a tick. Keep the solid/outlined key, but make the outlined bars at least 12 px wide before outlining them.

### [craft] Changelog rail overruns past the first and last version dots
- **Where:** src/sections/colophon/Colophon.module.css .log (l.150-176: border-left on the whole <ol>, dots centred in 48 px rows)
- **Fix:** Drop the border-left on .log. Draw the rail per item: `.log li:not(:last-child)::after { content:''; position:absolute; left:-2px; top:50%; height:100%; border-left:3px solid var(--cobalt) }`, so the rail runs only from the first dot's centre to the last dot's centre, matching DeployHistory.

### [recruiter] Fuzz button says '10,000 cross-tenant evaluations' when about half are cross-tenant
- **Where:** src/data/copy.ts (services.policy.demo.fuzzButton)
- **Fix:** Relabel the button to something like 'Fuzz it: 10,000 evaluations, half across tenants' (or '10,000 tenant-isolation checks'). The result line '0 cross-tenant leaks · 10,000 evaluations' is already accurate and needs no change.

### [correctness] Leader experiment still says to close this tab after it has passed
- **Where:** src/sections/chaos-lab/Breaker.tsx (LeaderBreaker, line ~206); src/data/copy.ts chaos.experiments.leader.instruction
- **Fix:** In LeaderBreaker, render the instruction only while `!result` (or while `q.nodes >= 2 && !result`). Once the result exists, show only the reward and MEASURED lines.

### [correctness] Retrieval copy turns '100K-token corpora' into an upper bound
- **Where:** src/data/node-copy.ts (retrieval.ingest.engineer: 'Corpora of up to 100K tokens'); src/data/copy.ts (retrieval.depth['30s']: 'documents of up to 100K tokens')
- **Fix:** Use the résumé wording, for example 'over 100K-token corpora' and 'answers questions over 100K-token document collections'. Check that the 'pgvector' hit-1 retrieval test still passes after the edit (see the note above `retrieval` in copy.ts).

### [a11y] Key hints still advertise shortcuts after the visitor turns Key shortcuts off
- **Where:** src/components/shell/Header.tsx (utility-bar .keyHint 'Keys p r c 2 ?'), src/sections/control-room/QuorumPrompt.tsx ('or press 2' hint), src/components/shell/shell.module.css
- **Fix:** Have the pre-paint script and the preferences store set html[data-keys='off'], and in CSS hide .keyHint, .railKeys and the QuorumPrompt hint when it is set (or render them from usePreferences().keys). Leave the key sheet's own KeysToggle visible so shortcuts can be turned back on.

### [a11y] On a phone, asking a question scrolls the focused question field off the top of the screen
- **Where:** src/sections/services/retrieval/ (the post-query scroll that brings 'Find it on this page' above the status strip)
- **Fix:** After the results render, either move focus to the results heading or the first result (tabindex=-1 on the heading, focus({preventScroll:true})), or limit the scroll so that both the focused field and the 'Find it on this page' link stay in view, and skip the extra scroll when the field would leave the viewport.

### [a11y] Changing the Device tier select reloads the page at once (WCAG 3.2.2, On Input)
- **Where:** src/components/shell/PreferenceControls.tsx (tier <Select> onChange calls window.location.reload())
- **Fix:** Store the override on change without reloading, then show an explicit 'Reload to apply' button next to the select (or reload only from that button). Otherwise reword the hint to 'Changing this reloads the page.' and tie it to the select with aria-describedby.

### [a11y] The camera consent dialog does not tie its privacy explanation to the dialog
- **Where:** src/components/ui/ConsentDialog.tsx
- **Fix:** Give the body paragraph(s) an id and add aria-describedby={bodyId} to the <dialog>, as is done for the label.

### [mobile] React hydration and module evaluation create boot tasks of 60–130 ms; INTERFACES.md says 'none (measured)'
- **Where:** src/main.tsx (hydrateRoot), the home page section tree (src/sections/*), docs/INTERFACES.md §4 'Long tasks' row
- **Fix:** Hydrate in smaller chunks. Wrap each below-fold section (Deploy History, Manifest, Contact, Colophon, Chaos Lab, and each service panel) in its own <Suspense> boundary, so React 19's selective hydration yields between them. Alternatively, hydrate those islands when they become visible or idle, as deviation 21 already suggests. Then correct the INTERFACES.md row to the measured value.

### [mobile] CLS is 0.004–0.017, not 0: late web fonts and the UP clock shift the hero
- **Where:** scripts/prerender.mjs (font preloads), src/styles/tokens.css or base.css (@font-face fallbacks), status strip component (UP readout), docs/INTERFACES.md §4 CLS row
- **Fix:** Add metric-matched fallback @font-face rules (size-adjust plus ascent and descent overrides over a local monospace or sans) for Martian Mono, Doto and Big Shoulders Stencil, so the swap does not reflow the 'In plain words' label line. Prerender the UP readout as a fixed-width placeholder (for example 'UP --:--' with a set ch width) so hydration only changes the text. Update the INTERFACES row to the measured value.

### [mobile] BM25 Index Explorer clips the idf column at 360 px with no visible pan cue
- **Where:** src/pages/experiments/IndexExplorer.tsx and its CSS module (table wrapper .ja / table .jb)
- **Fix:** Below about 400 px, shrink the chunk-bar column (for example a max-width of 4rem on the bar cell) or reduce the nested frame padding, so the 3-column table fits in 244 px. Or reuse the faded pannable-edge treatment that Tape already uses on narrow screens.

### [mobile] Sticky :hover on touch, and a pressed-to-unpressed flash that hides the label briefly
- **Where:** Button CSS module for .bi (src/components/ui/Button*.css or the equivalent), the Vision 'Motion sensors' toggle
- **Fix:** Wrap the .bi:hover (and other :hover fill) rules in `@media (hover:hover)`. Transition `color` together with `background-color` on .bi, or drop the background transition when aria-pressed changes, so text and background never pass through low contrast together.

### [security] On /projects/vision/ the camera can't be scrolled away, though the consent text promises it stops when you do
- **Where:** src/sections/services/vision/CameraStage.tsx (IntersectionObserver in the stop-on-Esc/scroll/hidden effect)
- **Fix:** Observe the viewfinder/stage element instead of the whole bench, or keep observing the bench but use a threshold such as [0, 0.35] and stop when intersectionRatio < 0.35 or when the Stage element is not intersecting. Then rerun the CDP check on /projects/vision/ at 1440x900 and 390x844: with the viewfinder scrolled out of view, the track should be 'ended'.
