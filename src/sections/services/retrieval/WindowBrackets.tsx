import { useMemo } from 'react'
import { useSvgId } from '../../../components/ui/ids.ts'
import { roundedRect } from '../../../lib/draw/paths.ts'
import { createRng, fmt, penLine, type Pt } from '../../../lib/draw/wobble.ts'
import type { SectionWindows } from '../../../lib/retrieval/types.ts'
import { S } from './strings.ts'
import styles from './Retrieval.module.css'

/**
 * The window miniature: a hand-drawn page of 12 ruled lines, and beside it a bracket for every 256-wordpiece
 * window of the section the hit came from. One rule is 64 wordpieces, so a window is exactly four rules, the
 * stride is three, and the overlap (the hatched band) is one: the whole "256 with 64 overlap" idea at a glance.
 * The cited window is the shaded one (`--live-soft`, spec 4.3); its neighbours' brackets stand in the lanes beside it.
 *
 * A section longer than 12 rules (768 wordpieces) scrolls: the view centres on the cited window.
 * Everything drawn comes from the hit's real offsets; the SVG is decorative (the caption says it in words).
 */

const ROWS = 12
const ROW_TOKENS = 64
const VIEW_TOKENS = ROWS * ROW_TOKENS

const W = 232
const H = 172
const PAGE = { x: 8, y: 8, w: 164, h: 156 }
const TOP = 19
const BOTTOM = 153
const BAND = BOTTOM - TOP
const BRACKET_X = PAGE.x + PAGE.w + 15
const LANES = 3

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n))

export interface WindowBracketsProps {
  section: SectionWindows
  /** Seed for the pen wobble (the chunk id), so every card is drawn a little differently and the same every time. */
  seed: string
  /** The 30-second depth: the caption says where the passage sits without wordpieces, and drops the line about what a rule is. */
  plain?: boolean
}

export function WindowBrackets({ section, seed, plain = false }: WindowBracketsProps) {
  const { windows, index, tokens } = section
  const patternId = useSvgId('hatch')
  const clipId = useSvgId('clip')
  const active = windows[index]

  const geometry = useMemo(() => {
    const centre = (active.start + active.end) / 2
    const viewStart = tokens > VIEW_TOKENS ? clamp(Math.round((centre - VIEW_TOKENS / 2) / ROW_TOKENS) * ROW_TOKENS, 0, tokens - VIEW_TOKENS) : 0
    const y = (token: number) => TOP + clamp((token - viewStart) / VIEW_TOKENS, 0, 1) * BAND
    const rng = createRng(`${seed}:rules`)

    const rules: string[] = []
    for (let row = 0; row < ROWS; row++) {
      const rowStart = viewStart + row * ROW_TOKENS
      if (rowStart >= tokens) break
      const filled = clamp((tokens - rowStart) / ROW_TOKENS, 0, 1)
      const ry = TOP + (row + 0.7) * (BAND / ROWS)
      // Ragged right edge, like text; the last line of the section is as short as the text is.
      const end = PAGE.x + 14 + (PAGE.w - 28) * (filled < 1 ? 0.15 + 0.8 * filled : 0.82 + rng() * 0.18)
      const points: Pt[] = [[PAGE.x + 14, ry], [end, ry]]
      rules.push(penLine(points, `${seed}:rule:${row}`, { amp: 0.6, step: 28 }))
    }

    const brackets = windows.map((window, i) => {
      const top = y(window.start)
      const bottom = y(window.end)
      if (bottom - top < 1) return null
      const x = BRACKET_X + (i % LANES) * 10
      const points: Pt[] = [[x - 6, top], [x, top], [x, bottom], [x - 6, bottom]]
      return { i, d: penLine(points, `${seed}:bracket:${i}`, { amp: 0.5, step: 40 }) }
    })

    // The part of the cited window that its neighbours share: the 64-wordpiece overlap.
    const overlaps: Array<{ top: number; height: number }> = []
    for (const other of [windows[index - 1], windows[index + 1]]) {
      if (!other) continue
      const from = Math.max(active.start, other.start)
      const to = Math.min(active.end, other.end)
      if (to > from) overlaps.push({ top: y(from), height: y(to) - y(from) })
    }

    const sectionEnd = tokens < viewStart + VIEW_TOKENS ? y(tokens) : null
    return {
      page: roundedRect(PAGE.x, PAGE.y, PAGE.w, PAGE.h, 3, `${seed}:page`, 0.7),
      rules,
      brackets,
      overlaps,
      band: { top: y(active.start), height: y(active.end) - y(active.start) },
      sectionEnd,
    }
  }, [active, windows, index, tokens, seed])

  const previous = windows[index - 1]
  const next = windows[index + 1]
  const overlap = previous ? Math.max(0, previous.end - active.start) : next ? Math.max(0, active.end - next.start) : null

  return (
    <figure className={styles.windows}>
      <svg className={styles.windowsSvg} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <pattern id={patternId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0 0V5" className={styles.hatch} />
          </pattern>
          <clipPath id={clipId}>
            <rect x={PAGE.x + 1} y={PAGE.y + 1} width={PAGE.w - 2} height={PAGE.h - 2} />
          </clipPath>
        </defs>
        <path d={geometry.page} className={styles.page} />
        <g clipPath={`url(#${clipId})`}>
          <rect x={PAGE.x} y={geometry.band.top} width={PAGE.w} height={geometry.band.height} className={styles.band} />
          {geometry.overlaps.map((o, i) => (
            <rect key={i} x={PAGE.x} y={o.top} width={PAGE.w} height={o.height} fill={`url(#${patternId})`} />
          ))}
          {geometry.rules.map((d, i) => (
            <path key={i} d={d} className={styles.rule} />
          ))}
          {geometry.sectionEnd === null ? null : <path d={`M${PAGE.x} ${fmt(geometry.sectionEnd)}H${PAGE.x + PAGE.w}`} className={styles.end} />}
        </g>
        {geometry.brackets.map((bracket) =>
          bracket ? <path key={bracket.i} d={bracket.d} className={bracket.i === index ? styles.bracketActive : styles.bracket} /> : null,
        )}
      </svg>
      <figcaption className={styles.windowsCaption}>
        {plain ? (
          <span>{S.windowPlain(index, windows.length)}</span>
        ) : (
          <>
            <span>{S.windowCaption(index, windows.length, active.start, active.end, tokens, overlap)}</span>
            <span className={styles.windowsRule}>{S.windowRule}</span>
          </>
        )}
      </figcaption>
    </figure>
  )
}
