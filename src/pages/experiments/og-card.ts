import { LAMP_GLOW_RINGS, cable, lamp, relay, rivet, roundedRect, type Pt } from '../../lib/draw/paths.ts'
import { penLine } from '../../lib/draw/wobble.ts'

/**
 * The social card (Open Graph image): 1200 x 630, hand-drawn from the same parts as the board (the relay,
 * the jewel lamps with their quantized glow, the cobalt patch cables), on warm paper. It always uses the
 * Paper palette, whatever theme the page is in, because a link preview is seen on someone else's page.
 * Canvas can read neither CSS variables nor SVG, so the palette is spelled out here (the spec's tokens)
 * and the SVG path strings from lib/draw are painted with `Path2D`.
 *
 * The composition is the one in docs/og.html, the hand-built SVG that public/og.png was rendered from: the
 * name and the one-sentence identity on the left; on the right a panel with the control-plane relay above
 * and, below it, one lamp per service on a patch cable, with the service's headline number under it.
 * This is the in-browser route to the same card, so that re-rendering after a copy change reproduces it.
 *
 * Only code, no generated imagery. The text is `copy.controlRoom` and the headline metrics in
 * `src/data/portfolio.ts` (passed in), never retyped.
 */

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

const PAPER = '#F3EEE4'
const PAPER_2 = '#EAE3D6'
const INK = '#1C1B18'
const INK_MUTED = '#4B4741'
const INK_RULE = '#B9B1A2'
const COBALT = '#1C38BB'
const LIVE = '#D8431F'

export const FONT_SPECS = [
  '800 146px "Big Shoulders Variable"',
  '700 15px "Big Shoulders Stencil Variable"',
  '700 38px "Atkinson Hyperlegible Next Variable"',
  '400 30px "Atkinson Hyperlegible Next Variable"',
  '500 22px "Martian Mono Variable"',
] as const

export interface OgText {
  eyebrow: string
  nameTop: string
  nameBottom: string
  tagline: string
  line: string
  domain: string
  /** The four service names, in lamp order. */
  lamps: readonly [string, string, string, string]
  /** The headline number under each lamp (`87%`), in lamp order. */
  metrics: readonly [string, string, string, string]
  /** `CONTROL PLANE`, set on two lines beside the relay. */
  plane: string
}

/** The largest font size (in whole px, at most `size`) at which `measure(text)` fits in `maxWidth`. Pure. */
export function fitSize(measure: (size: number) => number, size: number, maxWidth: number): number {
  let current = size
  while (current > 8 && measure(current) > maxWidth) current -= 2
  return current
}

/** The first word of a headline metric: `87% retrieval precision` -> `87%`, `120ms query latency, ...` -> `120ms`. Pure. */
export function metricFigure(headline: string): string {
  return headline.trim().split(/\s+/)[0] ?? headline
}

function path(ctx: CanvasRenderingContext2D, d: string, options: { stroke?: string; width?: number; fill?: string; alpha?: number }) {
  const shape = new Path2D(d)
  ctx.globalAlpha = options.alpha ?? 1
  if (options.fill) {
    ctx.fillStyle = options.fill
    ctx.fill(shape)
  }
  if (options.stroke) {
    ctx.strokeStyle = options.stroke
    ctx.lineWidth = options.width ?? 2.25
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke(shape)
  }
  ctx.globalAlpha = 1
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, color: string, spacing = 0, align: CanvasTextAlign = 'left') {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  // `letterSpacing` is newer than the rest of the 2D API: where it is missing the text is simply set tighter.
  ;(ctx as unknown as { letterSpacing?: string }).letterSpacing = `${spacing}px`
  ctx.fillText(value, x, y)
  ;(ctx as unknown as { letterSpacing?: string }).letterSpacing = '0px'
}

/** A screw head: a ring with a dot, the same one on the Chaos Lab panel. */
function screw(ctx: CanvasRenderingContext2D, x: number, y: number) {
  path(ctx, rivet(x, y, 5.2), { stroke: INK, width: 1.6, fill: PAPER })
  path(ctx, rivet(x, y, 1.4), { fill: INK })
}

export function drawCard(ctx: CanvasRenderingContext2D, copy: OgText): void {
  ctx.clearRect(0, 0, OG_WIDTH, OG_HEIGHT)
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT)

  // ---- left: who, and what this site is --------------------------------------------------------------
  text(ctx, copy.eyebrow, 64, 106, '700 23px "Big Shoulders Stencil Variable"', INK_MUTED, 3.4)
  const nameFont = (size: number) => `800 ${size}px "Big Shoulders Variable"`
  const nameSize = fitSize(
    (size) => {
      ctx.font = nameFont(size)
      return Math.max(ctx.measureText(copy.nameTop).width, ctx.measureText(copy.nameBottom).width)
    },
    146,
    580,
  )
  text(ctx, copy.nameTop, 60, 246, nameFont(nameSize), INK, -1.4)
  text(ctx, copy.nameBottom, 60, 372, nameFont(nameSize), INK, -1.4)
  path(ctx, penLine([[64, 414], [636, 414]], 'og:rule', { amp: 0.5, step: 40 }), { stroke: INK, width: 2.8 })
  text(ctx, copy.tagline, 64, 472, '700 38px "Atkinson Hyperlegible Next Variable"', INK)
  text(ctx, copy.line, 64, 516, '400 30px "Atkinson Hyperlegible Next Variable"', INK_MUTED)
  text(ctx, copy.domain, 64, 590, '500 22px "Martian Mono Variable"', COBALT, 0.4)

  // ---- right: the panel -------------------------------------------------------------------------------
  path(ctx, roundedRect(687, 64, 449, 502, 7, 'og:panel', 1), { stroke: INK, width: 3, fill: PAPER_2 })
  path(ctx, roundedRect(701, 78, 421, 474, 5, 'og:inner', 0.8), { stroke: INK_RULE, width: 1.4 })
  for (const [x, y] of [[702, 78], [1122, 78], [702, 552], [1122, 552]] as const) screw(ctx, x, y)

  // The control-plane relay, with its arm thrown: a message is passing.
  const box = relay(912, 176, 168, 'og:relay')
  path(ctx, box.body, { stroke: INK, width: 2.2, fill: PAPER })
  path(ctx, box.core, { stroke: INK, width: 1.8, fill: PAPER_2 })
  path(ctx, box.coil, { stroke: INK, width: 1.8 })
  path(ctx, box.yoke, { stroke: INK, width: 2.2 })
  for (const [x, y] of [box.contactLeft, box.contactRight] as const) path(ctx, rivet(x, y, 4.4), { stroke: INK, width: 1.8, fill: PAPER })
  ctx.save()
  ctx.translate(box.pivot[0], box.pivot[1])
  ctx.rotate((-17 * Math.PI) / 180)
  ctx.translate(-box.pivot[0], -box.pivot[1])
  path(ctx, box.arm, { stroke: INK, width: 2.8 })
  path(ctx, rivet(box.tip[0], box.tip[1], 4), { fill: INK })
  ctx.restore()
  path(ctx, rivet(box.pivot[0], box.pivot[1], 4.6), { stroke: INK, width: 1.8, fill: PAPER })
  path(ctx, rivet(box.pivot[0], box.pivot[1], 1.5), { fill: INK })
  for (const [x, y] of box.terminals) path(ctx, rivet(x, y, 4.2), { stroke: INK, width: 1.8, fill: PAPER })
  const [first, second] = copy.plane.split(' ')
  text(ctx, first ?? copy.plane, 814, 174, '700 15px "Big Shoulders Stencil Variable"', INK_MUTED, 2.2, 'right')
  if (second) text(ctx, second, 814, 193, '700 15px "Big Shoulders Stencil Variable"', INK_MUTED, 2.2, 'right')

  // One lamp per service, on a patch cable from one relay terminal, with its headline number underneath.
  const LAMP_Y = 408
  const R = 19
  copy.lamps.forEach((label, index) => {
    const x = 750 + index * 108
    const from: Pt = box.terminals[index]
    const to: Pt = [x, LAMP_Y - R * 1.266]
    const wire = cable(from, to, { sag: 30, plug: 14, seed: `og:cable:${index}` })
    path(ctx, wire.d, { stroke: COBALT, width: 3.6 })
    path(ctx, wire.plugA, { stroke: INK, width: 1.8, fill: PAPER })
    path(ctx, wire.plugB, { stroke: INK, width: 1.8, fill: PAPER })

    const parts = lamp(x, LAMP_Y, R, `og:lamp:${label}`)
    for (const ring of LAMP_GLOW_RINGS.slice(0, 3)) {
      ctx.globalAlpha = ring.opacity
      ctx.fillStyle = LIVE
      ctx.beginPath()
      ctx.arc(x, LAMP_Y, R * ring.k, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    path(ctx, parts.bezel, { stroke: INK, width: 2.2, fill: PAPER_2 })
    path(ctx, parts.lens, { stroke: INK, width: 1.8, fill: LIVE })
    path(ctx, parts.glare, { stroke: PAPER, width: 2.4, alpha: 0.85 })
    text(ctx, label, x, 468, '700 15px "Big Shoulders Stencil Variable"', INK, 1.6, 'center')
    text(ctx, copy.metrics[index], x, 512, '800 38px "Big Shoulders Variable"', INK, 0, 'center')
  })
}
