import { useState, type ReactNode } from 'react'
import { cx } from './cx.ts'
import styles from './ui.module.css'

export interface ReadoutProps {
  /** The Doto word before the value, e.g. `NODES`. Doto is for digits and the words NODES / TERM / UP / MS only. */
  label?: string
  /** The value. Keep it short: digits, `—`, a unit. */
  value: ReactNode
  /** Reserve this many `ch` for the value so a changing number never shifts the layout (CLS 0). Default 2. */
  width?: number
  size?: 'sm' | 'md' | 'lg'
  /** Where the digits sit inside their reserved width. `end` (default) keeps a changing number right-aligned; a meter reads left to right. */
  align?: 'start' | 'end'
  /**
   * `dot` (default) is Doto, round dots like an LED annunciator: right for NODES and TERM and anything of two or three digits. Its decimal
   * point is a plus-shaped cluster of five dots, so a number with a decimal ("7.9" read as "7 + 9") and a small figure beside a dial use
   * `mono` (Martian Mono, bold) instead.
   */
  face?: 'dot' | 'mono'
  /** Flash `--live` for 120 ms when the value changes (default true; skipped under lite motion). */
  flash?: boolean
  className?: string
}

/** An LED-annunciator style readout: round dots (Doto, ROND 100), fixed width, flashes on change. */
export function Readout({ label, value, width = 2, size = 'md', align = 'end', face = 'dot', flash = true, className }: ReadoutProps) {
  // Count changes during render (the documented "derive state from a previous render" pattern) and use it
  // as a key, so the span remounts and its CSS animation plays once per change, never on first paint.
  const [previous, setPrevious] = useState(value)
  const [changes, setChanges] = useState(0)
  if (previous !== value) {
    setPrevious(value)
    setChanges((count) => count + 1)
  }
  return (
    <span className={cx(styles.readout, styles[`readout-${size}`], face === 'mono' && styles.readoutMono, className)}>
      {label ? <span className={styles.readoutLabel}>{label}</span> : null}
      <span
        key={changes}
        className={cx(styles.readoutValue, align === 'start' && styles.readoutStart, flash && changes > 0 && styles.readoutFlash)}
        style={{ minWidth: `${width}ch` }}
      >
        {value}
      </span>
    </span>
  )
}
