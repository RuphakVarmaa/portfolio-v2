import { useEffect, useRef, type ReactNode } from 'react'
import { announce } from '../../cluster/live-region.ts'
import { cx } from './cx.ts'
import { compactLine } from './tape-fields.ts'
import { TapeText } from './TapeText.tsx'
import styles from './ui.module.css'

export interface TapeLine {
  /** Stable key if you have one (otherwise the index is used). */
  id?: string | number
  text: ReactNode
  /** `muted` for context, `live` for events that are happening now, `cobalt` for allow/connection. */
  tone?: 'ink' | 'muted' | 'live' | 'cobalt'
  /** What to announce for this line when `announce` is on and `text` is not a string. */
  plain?: string
}

export interface TapeProps {
  /** Oldest first; new lines are appended at the bottom, like a printing tape. */
  lines: ReadonlyArray<string | TapeLine>
  /** Accessible name of the log. */
  label: string
  /** A header line printed on the tape, e.g. `AUDIT LOG (what the production system would write)`. */
  header?: ReactNode
  /** Keep only the newest `max` lines in the DOM. Default 200. */
  max?: number
  /**
   * Forward newly appended lines to the site's single live region (throttled to one update per 800 ms
   * and coalesced, see `announce`). The tape itself is never `aria-live`, so nothing is read twice.
   */
  announce?: boolean
  /** Shown while there are no lines. */
  empty?: ReactNode
  /** CSS height of the scrolling area. Default `14rem`. */
  height?: string
  className?: string
}

/**
 * A string line: as written, and for the two logs with a fixed shape (the policy audit line, the operator log) also in the form
 * a phone's tape prints (`compactLine`: the answer first, the time short or last). The tape's own width picks one, in CSS.
 */
function LineText({ text }: { text: string }) {
  const narrow = compactLine(text)
  if (narrow === null) return <TapeText text={text} />
  return (
    <>
      <span className={styles.tapeWide}>
        <TapeText text={text} />
      </span>
      <span className={styles.tapeNarrow}>{narrow}</span>
    </>
  )
}

/** Mark the scroller `data-pan` while there is more to read to its right (a narrow tape pans sideways), so CSS can fade that edge. */
const markPan = (el: HTMLElement) => {
  if (el.scrollWidth - el.clientWidth - el.scrollLeft > 4) el.setAttribute('data-pan', '')
  else el.removeAttribute('data-pan')
}

const textOf = (line: string | TapeLine): string => {
  if (typeof line === 'string') return line
  if (line.plain) return line.plain
  return typeof line.text === 'string' ? line.text : ''
}

/**
 * Mono entries on ruled paper. Each entry has one sprocket hole at its first row; a long entry breaks between its
 * fields only (a `key=value` pair, a `·` part, never `policy-b` in the middle) and the rows after the first hang
 * under the hole, so an entry reads as one entry. On a narrow tape an entry is one row and the tape pans
 * sideways. Scrolls itself to the newest entry unless the visitor has scrolled up to read. Focusable (it scrolls),
 * `role="log"`.
 */
export function Tape({ lines, label, header, max = 200, announce: announceLines = false, empty, height = '14rem', className }: TapeProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const lastAnnounced = useRef('')
  const visible = lines.length > max ? lines.slice(-max) : lines

  const last = lines.length > 0 ? lines[lines.length - 1] : undefined
  const lastText = last === undefined ? '' : textOf(last)
  const signature = `${lines.length}:${lastText}`

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    if (stick.current) el.scrollTop = el.scrollHeight
    markPan(el)
  }, [signature])

  // The tape's width follows its column, so a window that is resized (or a phone turned) changes whether it pans.
  useEffect(() => {
    const el = scroller.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => markPan(el))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!announceLines || lines.length === 0 || signature === lastAnnounced.current) return
    lastAnnounced.current = signature
    if (lastText) announce(lastText)
  }, [announceLines, lines.length, lastText, signature])

  return (
    <div className={cx(styles.tape, className)}>
      {header ? <div className={styles.tapeHeader}>{header}</div> : null}
      <div
        ref={scroller}
        className={styles.tapeScroll}
        style={{ height }}
        role="log"
        aria-label={label}
        aria-live="off"
        tabIndex={0}
        onScroll={(event) => {
          const el = event.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          markPan(el)
        }}
      >
        <div className={styles.tapeInner}>
          {visible.length === 0 ? (
            <p className={styles.tapeEmpty}>{empty ?? 'no entries yet'}</p>
          ) : (
            <ol className={styles.tapeLines}>
              {visible.map((line, index) => {
                const item: TapeLine = typeof line === 'string' ? { text: line } : line
                return (
                  <li key={item.id ?? index} className={cx(styles.tapeLine, item.tone && styles[`tape-${item.tone}`])}>
                    {typeof item.text === 'string' ? <LineText text={item.text} /> : item.text}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
