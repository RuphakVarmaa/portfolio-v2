import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { BEZEL_R, LAMP_ART_W, RELAY_SHARE } from './board-art.ts'
import { LAMP_BEZEL, SENSORS_BEZEL } from './board-cables.ts'
import { BOARD_SIZE, LAMP_ORDER } from './lamp-positions.ts'

/**
 * Static guards over this section's own source: the rules the spec states as "never" (no render loop, no
 * timer-driven motion, no gradients, no hard-coded colours), and the numbers the stylesheet repeats from
 * the TypeScript (so a change in one cannot silently drift from the other).
 */

const dir = new URL('./', import.meta.url)
const files = readdirSync(dir).filter((name) => /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts'))
const read = (name: string) => readFileSync(new URL(name, dir), 'utf8')
const css = read('ControlRoom.module.css')

/** Source without comments, so a sentence like "there is no render loop" is not mistaken for code. */
const code = (name: string) =>
  read(name)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

test('there is no render loop and no timer in this section: nothing moves unless a real message arrived', () => {
  assert.ok(files.length >= 14, 'the section files were found')
  for (const name of files) {
    const text = code(name)
    assert.ok(!/\b(requestAnimationFrame|cancelAnimationFrame|setInterval|setTimeout|requestIdleCallback)\b/.test(text), `${name} uses a timer or a frame loop`)
  }
})

test('the relay throws and the cables pulse only from scheduler.onMessage', () => {
  const motion = code('useBoardMotion.ts')
  assert.equal(motion.match(/scheduler\.onMessage\(/g)?.length, 1)
  assert.equal(motion.match(/\bthrowRelay\(/g)?.length, 2, 'one definition, one call (inside the onMessage handler)')
  assert.equal(motion.match(/\bpulseCable\(/g)?.length, 2, 'one definition, one call (inside the onMessage handler)')
  const handler = motion.slice(motion.indexOf('scheduler.onMessage('))
  assert.ok(handler.includes('throwRelay(') && handler.includes('pulseCable('))
  // The throws run on the board only while it is on screen, and never under lite motion.
  assert.ok(handler.includes("dataset.visible !== '1'") && handler.includes('document.hidden'))
  assert.ok(/if \(!root \|\| motionLite\) return/.test(motion))
  // Ping and pong never reach the relay: the scheduler does not report them, and this code does not ask.
  assert.ok(!/ping|pong/.test(motion))
})

test('the motion code finds its parts by the data hooks the markup carries', () => {
  const svg = read('BoardSvg.tsx')
  assert.ok(svg.includes('data-arm=""'))
  assert.match(svg, /data-contact=\{i === 0 \? 'in' : 'out'\}/, 'the left contact is `in` (+18 degrees swings the tip left), the right one `out`')
  assert.ok(read('Cables.tsx').includes('data-pulse={cable.id}'))
  assert.ok(read('Board.tsx').includes('data-board=""'), 'telemetry samples frames only while data-board is 10 % on screen')
  const motion = read('useBoardMotion.ts')
  for (const hook of ['[data-arm]', '[data-contact="${direction}"]', '[data-pulse="${lamp}"]']) assert.ok(motion.includes(hook), hook)
})

test('nothing touches window, document or navigator at module scope (the page is prerendered on the server)', () => {
  for (const name of files) {
    for (const line of code(name).split('\n')) {
      if (/^\s/.test(line) || line === '') continue
      assert.ok(!/\b(window|document|navigator|localStorage|sessionStorage|matchMedia)\b/.test(line), `${name}: ${line}`)
    }
  }
})

test('every sprite id that is referenced is defined, once', () => {
  const sources = files.map(read).join('\n') + css
  const referenced = new Set([...sources.matchAll(/(?:href="|url\()#(qb-[\w-]+)/g)].map((m) => m[1]))
  const defined = [...sources.matchAll(/\bid="(qb-[\w-]+)"/g)].map((m) => m[1])
  assert.deepEqual([...referenced].sort(), ['qb-dither', 'qb-hx', 'qb-lamp', 'qb-rb'])
  for (const id of referenced) assert.equal(defined.filter((d) => d === id).length, 1, `#${id} is defined ${defined.filter((d) => d === id).length} times`)
})

test('the stylesheet follows the design rules: no gradients, no blur, no literal colours, square corners, no !important', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.ok(!/gradient\(/.test(bare), 'no gradients (the lamp glow is four hard steps)')
  assert.ok(!/\bblur\(|\bfilter\s*:|\bbackdrop-filter/.test(bare), 'no blur, no filters')
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(bare), 'colours come from the tokens')
  assert.ok(!/\brgba?\(|\bhsla?\(/.test(bare), 'colours come from the tokens')
  assert.ok(!/!important/.test(bare))
  for (const [, value] of bare.matchAll(/border-radius:\s*([^;]+);/g)) assert.match(value, /^(0|50%)$/, 'a switchboard is square; only lamps and pips are round')
})

test('the sprite is styled by plain class selectors: an ancestor outside the <use> does not match inside its shadow tree', () => {
  // The lamp and the hexagon are drawn once in the sprite and `<use>`d. In the instance, a selector such as
  // `html[data-theme='dark'] .g1` does not match (the ancestor is outside the cloned subtree), so state has to
  // reach the parts as custom properties, which do inherit. (That is how the Ink theme's dithered halo was lost once.)
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const parts = ['hex', 'g1', 'gd', 'g2', 'g3', 'tilt', 'shadowFill', 'lampBezel', 'focusRing', 'lens', 'halfLeft', 'halfRight', 'glare', 'ditherDot']
  const selectors = [...bare.matchAll(/([^{}]+)\{/g)].flatMap((match) => match[1].split(',').map((selector) => selector.trim()))
  assert.ok(selectors.length > 100)
  for (const part of parts) {
    assert.ok(selectors.some((selector) => selector.startsWith(`.${part}`)), `.${part} is styled somewhere`)
    for (const selector of selectors) {
      assert.ok(!new RegExp(`[\\s>+~]\\.${part}(?![\\w-])`).test(selector), `.${part} has an ancestor in: ${selector}`)
    }
  }
})

test('every transition and animation runs on the motion tokens (instant under lite motion), or is a one-millisecond step', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.ok(!/(transition|animation)-duration/.test(bare))
  for (const [, value] of bare.matchAll(/\b(?:transition|animation):\s*([^;]+);/g)) {
    for (const part of value.split(/,(?![^(]*\))/)) {
      // --hu is a custom property that is var(--dur-1) in the resting state and 0ms while a lamp is degraded (the dark half appears at once).
      assert.ok(/var\(--dur-/.test(part) || /var\(--hu/.test(part) || /\b1ms\b/.test(part), `not on a motion token: ${part.trim()}`)
    }
  }
})

test('the stylesheet repeats the numbers the geometry is built from', () => {
  const lamp = (selector: string) => Number(new RegExp(`${selector}\\s*\\{[^}]*--w:\\s*([\\d.]+)cqw`).exec(css)?.[1])
  const near = (actual: number, expected: number, tolerance = 0.06) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`)
  const share = (bezel: number, board: number) => ((LAMP_ART_W * bezel) / BEZEL_R / board) * 100
  // The lamp art is 110 board units wide on the landscape board and 110 x (36 / 51) on the portrait one.
  near(lamp('\\.lampItem'), share(LAMP_BEZEL.narrow, BOARD_SIZE.narrow.width))
  near(lamp('\\.lampItem\\[data-row=\'mid\'\\]'), share(SENSORS_BEZEL.narrow, BOARD_SIZE.narrow.width))
  const wide = /@media \(min-width: 900px\) \{[\s\S]*?\.lampItem \{\s*--w:\s*([\d.]+)cqw/.exec(css)
  near(Number(wide?.[1]), share(LAMP_BEZEL.wide, BOARD_SIZE.wide.width))
  const wideMid = /@media \(min-width: 900px\) \{[\s\S]*?\.lampItem\[data-row='mid'\] \{\s*--w:\s*([\d.]+)cqw/.exec(css)
  near(Number(wideMid?.[1]), share(SENSORS_BEZEL.wide, BOARD_SIZE.wide.width))
  // The relay is 43 % of the portrait board and 25 % of the landscape one; the board's aspect ratios are its drawing spaces.
  assert.match(css, new RegExp(`\\.relayBox \\{[^}]*width: ${RELAY_SHARE.narrow * 100}%`))
  assert.match(css, new RegExp(`@media \\(min-width: 900px\\) \\{[\\s\\S]*?\\.relayBox \\{\\s*width: ${RELAY_SHARE.wide * 100}%`))
  assert.match(css, new RegExp(`aspect-ratio: ${BOARD_SIZE.narrow.width} / ${BOARD_SIZE.narrow.height}`))
  assert.match(css, new RegExp(`aspect-ratio: ${BOARD_SIZE.wide.width} / ${BOARD_SIZE.wide.height}`))
})

test('the layout switches at one width (900 px) wherever the board differs between its two layouts', () => {
  const widths = new Set([...css.matchAll(/@media \(min-width: (\d+)px\)/g)].map((m) => m[1]))
  assert.ok(widths.has('900'))
  // 640 (type and spacing), 900 (the board), 1024 (two columns) are the only plain min-width breakpoints. The landscape board is
  // 828 px wide in a 900 px viewport, the least it can be: below that its rem-sized nameplates overprint its frame (review round 1: 700 to 800 px).
  // The two other conditions below are about the first screen, not the board's drawing: a short desktop screen (1024 px and up,
  // 860 px high or less) and the screen-only 1280 px rule that hangs the boot tape in the board's top band.
  assert.deepEqual([...widths].sort(), ['1024', '640', '900'])
})

test('the first screen is a budget: one column in the spec\'s order below 1024 px, two columns from it, and nothing reserved for the notice', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  // Phones and tablets: eyebrow, identity, headline, lead, the lead's plain caption, the prompt, the links, the index, the authorship line.
  assert.match(bare, /\.layout \{[^}]*grid-template-areas: 'e' 'i' 't' 'l' 'c' 'p' 'k' 'n' 'a';/)
  assert.match(bare, /\.side \{\s*display: contents;/, 'the right column dissolves below 1024 px, so its pieces are placed by the hero grid')
  for (const [selector, area] of [['eyebrow', 'e'], ['identity', 'i'], ['title', 't'], ['lead', 'l'], ['plain', 'c'], ['prompt', 'p'], ['links', 'k'], ['indexBox', 'n'], ['authorship', 'a']]) {
    assert.match(bare, new RegExp(`\\.${selector} \\{[^}]*grid-area: ${area};`), `.${selector} is in the grid area ${area}`)
  }
  // From 1024 px the old two columns: the right one is one block again.
  assert.match(bare, /@media \(min-width: 1024px\) \{[\s\S]*?grid-template-areas: 'e s' 'i s' 't s' 'l s' 'p s';[\s\S]*?\.side \{\s*display: block;\s*grid-area: s;/)
  // The notice is empty until something happened: no min-height holds a blank band under the button (it kept the switchboard below the fold).
  assert.ok(!/\.rewards?\s*\{[^}]*min-height/.test(bare))
  assert.ok(!/\.reward\[data-shown\]\s*\{[^}]*min-height/.test(bare))
  // A short desktop screen is sized by its height too.
  assert.match(bare, /@media \(min-width: 1024px\) and \(max-height: 860px\) \{[\s\S]*?\.title \{[^}]*9\.6vh/)
  // The markup keeps the two-column order (the index, the links, the authorship line, the caption inside `.side`); the service index is two boxes.
  const hero = code('index.tsx')
  assert.ok(hero.indexOf('<QuorumPrompt />') < hero.indexOf('className={styles.side}'))
  assert.ok(hero.indexOf('<ServiceIndex />') < hero.indexOf('styles.authorship') && hero.indexOf('styles.authorship') < hero.indexOf('styles.plain'))
  // The résumé links are drawn on both sides of the list, and CSS shows one of the two (a phone: before the list; from 1024 px: after it), so the Tab order is the reading order at every width.
  const index = code('ServiceIndex.tsx')
  const body = index.slice(index.indexOf('export function ServiceIndex()'))
  assert.ok(body.indexOf('<Links first />') < body.indexOf('styles.indexBox') && body.indexOf('styles.indexBox') < body.indexOf('<Links />'))
  assert.match(bare, /\.links:not\(\[data-first\]\) \{\s*display: none;/)
  assert.match(bare, /@media \(min-width: 1024px\) \{\s*\.links\[data-first\] \{\s*display: none;\s*\}\s*\.links:not\(\[data-first\]\) \{\s*display: flex;/)
})

test('from 1280 px the boot tape hangs in the board\'s top band, out of the flow, only where the board is shown and never in print', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.match(
    bare,
    /@media screen and \(min-width: 1280px\) \{\s*html\[data-js\]:not\(\[data-machine='off'\]\) \.boot \{\s*position: absolute;\s*z-index: 3;\s*inset-inline: calc\(var\(--gutter\) \+ 28px\);\s*margin-top: calc\(var\(--s-4\) \+ 8px\);/,
  )
  // The wrap is its containing block, and the tape is the board's previous sibling (so its static position is the board's top edge less the figure's margin).
  assert.match(bare, /\.inner \{\s*position: relative;/)
  const hero = code('index.tsx')
  assert.ok(hero.includes('`wrap ${styles.inner}`'))
  assert.ok(hero.indexOf('<BootLine />') < hero.indexOf('<Board />'))
  assert.match(bare, /\.boardFigure \{\s*margin: var\(--s-4\) 0 0;/, 'the board starts 16 px under the columns: the tape hangs 8 px inside its frame')
})

test('the boot line is drawn as tokens: unbreakable measurements with their separator glued on, no break "anywhere", and a row count reserved for every width', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.ok(!/overflow-wrap:\s*anywhere/.test(bare), 'a measurement is never cut in the middle')
  assert.match(bare, /\.tok,\s*\.tok\[data-closing\] > span \{\s*white-space: nowrap;/)
  assert.match(bare, /@media \(max-width: 639px\) \{\s*\.tok\[data-closing\] \{\s*white-space: normal;/, 'a phone may part the closing clause after its semicolon')
  const bootLine = code('BootLine.tsx')
  assert.ok(bootLine.includes('bootTokens(text)') && bootLine.includes('styles.tok') && bootLine.includes('data-closing'))
  assert.ok(!/\{text\}/.test(bootLine), 'the line is no longer one string')
  // The rows the tape reserves (--lines) only ever grow as the width shrinks, from two on a desktop; they were measured with the
  // longest line the page can print (src/sections/control-room/boot-tokens.test.ts simulates the wrapping at every width).
  assert.match(bare, /\.boot \{[^}]*--lines: 2;/)
  const steps = [...bare.matchAll(/@media \(max-width: (\d+)px\) \{\s*\.boot \{\s*--lines: (\d+);/g)].map((m) => [Number(m[1]), Number(m[2])])
  assert.ok(steps.length >= 5, 'the tape reserves more rows on narrower phones')
  for (const [index, [width, lines]] of steps.entries()) {
    assert.ok(lines > (index === 0 ? 2 : steps[index - 1][1]), `${width} px: more rows than the wider band`)
    if (index > 0) assert.ok(width < steps[index - 1][0], 'bands run from wide to narrow')
  }
  assert.equal(steps.at(-1)?.[1], 8, 'a 320 px phone needs eight rows for the longest line')
})

test('the hero shows a failover in the tab that survived it, without a second status region', () => {
  const prompt = code('QuorumPrompt.tsx')
  assert.ok(prompt.includes('advanceNotice(memory, state)') && prompt.includes('advanceNotice(NO_NOTICE, state)') && prompt.includes('noticeLines(remembered, state, blocked, NOTICE_TEXT)'))
  assert.ok(prompt.includes('copy.chaos.experiments.leader.reward'), 'the spec 3.4 sentence, written once')
  assert.equal(prompt.match(/role="status"/g)?.length, 1, 'the join line is the only status region; the failover line is shown, not announced')
  assert.ok(prompt.includes('key={remembered.seq}'), 'a new failover redraws the line, so its entrance flash plays again')
})

test('the markup carries the hooks the global state selectors rely on', () => {
  const board = read('Board.tsx')
  assert.ok(board.includes('data-machine-only=""') && board.includes('data-js-only=""') && board.includes('data-no-print=""'))
  assert.ok(read('OffList.tsx').includes('data-machine-off-only=""'))
  assert.ok(read('QuorumPrompt.tsx').includes('role="status"'), 'the reward line is a live region')
  assert.ok(read('QuorumPrompt.tsx').includes('data-js-only=""'), 'the key hint does nothing without JavaScript')
})

test('the board assembles at once under lite motion: every animation delay derives from --dur-boot, none is a fixed time', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const delays = [...bare.matchAll(/animation-delay:\s*([^;]+);/g)].map((match) => match[1])
  assert.ok(delays.length >= 5, 'the cables, their sheen, both plugs and the tag are staggered')
  for (const delay of delays) assert.ok(delay.includes('var(--dur-boot)'), `a fixed delay stays under lite motion: ${delay}`)
})

test('pointing at a lamp, or tabbing to it, leans on its own cable (and only its own)', () => {
  assert.ok(read('Lamp.tsx').includes('data-lamp={id}'))
  assert.ok(read('Cables.tsx').includes('data-cable={cable.id}'))
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const id of LAMP_ORDER) {
    assert.ok(
      bare.includes(`.board:has([data-lamp='${id}']:is(:hover, :focus-visible)) [data-cable='${id}']`),
      `${id} has a lean rule that names its own cable`,
    )
  }
  assert.match(bare, /\.cableLine \{[^}]*stroke-width: calc\(var\(--cw\) \* \(1 \+ var\(--lean, 0\)/)
})

test('keyboard focus scrolls a lamp into view with its nameplate, clear of the header and the strip (WCAG 2.2 focus not obscured)', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.match(bare, /\.lampItem\[data-row='top'\] \.lamp \{\s*scroll-margin-top:/)
  assert.match(bare, /\.lampItem:not\(\[data-row='top'\]\) \.lamp \{\s*scroll-margin-bottom: calc\(5rem - var\(--s-3\)\)/)
  // the strip clearance itself is global (base.css), so every control near the bottom edge gets it, not only lamps
  const base = readFileSync(new URL('../../styles/base.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.match(base, /html\[data-machine='on'\] \{\s*scroll-padding-bottom: calc\(var\(--strip-h\) \+ var\(--s-3\)/)
})

test('the index and the board read paths and ids from the shared constants, not from retyped strings', () => {
  const index = code('ServiceIndex.tsx')
  assert.ok(index.includes('copy.contact.resume') && index.includes('SECTION_IDS.contact'))
  assert.ok(!index.includes('/Ruphak-Varmaa-Resume.pdf') && !index.includes("'/resume/'"))
  assert.ok(index.includes("from '../../data/portfolio.ts'") && index.includes('project.headlineMetric') && index.includes('project.title'))
})

test('the boot line is the log of the boot: it is built from each node\'s first ready, never from the live timing a respawn overwrites', () => {
  const bootLine = code('BootLine.tsx')
  assert.match(bootLine, /workers:\s*bootTimings\(remembered, telemetry\.workers\)/)
  assert.ok(!/workers:\s*telemetry\.workers/.test(bootLine), 'the raw snapshot must not reach buildBootLine')
  assert.ok(bootLine.includes('rememberFirstReady(firstReady, telemetry.workers)'))
})

test('hash navigation: the control room mounts it, and links and hash changes go through goToId, the shared landing correction', () => {
  assert.ok(code('index.tsx').includes('useHashNavigation()'))
  const nav = code('useHashNavigation.ts')
  assert.ok(nav.includes("import { goToId, holdOnTarget } from '../../lib/draw/motion.ts'"))
  assert.equal(nav.match(/\bgoToId\(id\)/g)?.length, 2, 'one call for a click, one for a hash change')
  // The browser keeps the URL's fragment and history: the page adds its own entry, once, for a link it takes over.
  assert.ok(nav.includes('window.history.pushState(null, \'\', link.hash)') && nav.includes('window.location.hash !== link.hash'))
  // It only ever listens: a click, a hash change. The deep-link hold (a resize observer, the visitor's own input) is the shared
  // one in lib/draw/motion.ts; there is no timer and no frame loop in this file.
  assert.ok(nav.includes("'hashchange'") && nav.includes('holdOnTarget(target, HOLD_UNTIL_MS)'))
  // The service index and the list under "Skip the machine" are plain anchors; no per-link handler competes with it.
  assert.ok(!/onClick/.test(code('ServiceIndex.tsx')) && !/onClick/.test(code('OffList.tsx')))
})
