import { useEffect, useMemo, useRef } from 'react'
import type { Finding } from '../../../cluster/protocol.ts'
import { isLite } from '../../../lib/draw/motion.ts'
import { sourceLines } from '../../../lib/review/analyze.ts'
import { Marginalia } from './Marginalia.tsx'
import styles from './Review.module.css'
import { REVIEW_STRINGS as t } from './strings.ts'
import { TierShape } from './TierShape.tsx'

/**
 * The galley: the reviewed source set as one added hunk of a diff (`@@ -0,0 +1,N @@`), a line number and a
 * `+` in the margin of every line, and the review comments beside the lines they are about. A flagged line
 * trades its `+` for its most severe tier's shape; a finding that spans lines (a long function) draws a rule
 * down the margin for its whole span. The galley shows the exact text that was reviewed, so line numbers
 * always match the findings.
 *
 * Structure: an ordered list of lines (each its own list item, with the notes inside it), so a screen
 * reader hears "line 12, 2 findings" and the notes right where they apply. Long files scroll inside a
 * keyboard-focusable region instead of stretching the page. On a narrow panel (a phone) the code is not
 * wrapped, since a line cut in the middle of an identifier reads as two: the region scrolls sideways as one
 * sheet, with the margin and the notes held at the left edge (Review.module.css, the narrow `@container` block).
 *
 * `jump` scrolls that line to the top of the galley (a tier button in the tally asks for it): the region
 * scrolls, never the page, smoothly unless motion is lite.
 */

export interface GalleyJump {
  line: number
  /** Bumped on every request, so asking for the same line twice scrolls twice. */
  seq: number
}

export function Galley({ source, filename, findings, jump }: { source: string; filename: string; findings: readonly Finding[]; jump?: GalleyJump | null }) {
  const region = useRef<HTMLDivElement>(null)
  const lines = useMemo(() => sourceLines(source), [source])
  const byLine = useMemo(() => {
    const map = new Map<number, Finding[]>()
    for (const finding of findings) {
      const list = map.get(finding.line)
      if (list) list.push(finding)
      else map.set(finding.line, [finding])
    }
    for (const list of map.values()) list.sort((a, b) => a.tier - b.tier)
    return map
  }, [findings])
  /** Lines inside a multi-line finding: the first line of the span, and the lines after it. */
  const spans = useMemo(() => {
    const map = new Map<number, 'start' | 'inside'>()
    for (const finding of findings) {
      if (finding.endLine === undefined) continue
      map.set(finding.line, 'start')
      for (let line = finding.line + 1; line <= finding.endLine; line++) if (!map.has(line)) map.set(line, 'inside')
    }
    return map
  }, [findings])

  useEffect(() => {
    if (!jump) return
    const container = region.current
    const target = container?.querySelector<HTMLElement>(`[data-line="${jump.line}"]`)
    if (!container || !target) return
    // The hunk header is sticky at the top: stop just below it.
    const header = container.querySelector<HTMLElement>('[data-hunk]')?.offsetHeight ?? 0
    // From the boxes, not `offsetTop`: the sheet that holds the lines may or may not be the line's offset parent.
    const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientTop + container.scrollTop
    // `left: 0`: on a narrow galley, which scrolls sideways, the line is shown from its start.
    container.scrollTo({ top: Math.max(0, offset - header), left: 0, behavior: isLite() ? 'auto' : 'smooth' })
  }, [jump])

  return (
    <div ref={region} className={styles.galley} role="region" aria-label={t.galleyLabel(filename)} tabIndex={0}>
      <p className={styles.hunk} data-hunk="">
        {t.hunkRange(lines.length)} <span className={styles.nb}>{filename}</span>
      </p>
      <div className={styles.sheet}>
        <ol className={styles.lines} role="list">
          {lines.map((text, index) => {
            const number = index + 1
            const notes = byLine.get(number)
            const top = notes?.[0].tier
            return (
              <li key={number} className={styles.line} data-line={number} data-tier={top} data-span={spans.get(number)}>
                {notes ? <span className="sr-only">{t.flagged(number, notes.length)}</span> : null}
                <span className={styles.no} aria-hidden="true">
                  {number}
                </span>
                <span className={styles.mark} aria-hidden="true">
                  {top ? <TierShape tier={top} size={13} /> : '+'}
                </span>
                <code className={styles.code}>{text === '' ? ' ' : text}</code>
                {notes ? <Marginalia findings={notes} /> : null}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
