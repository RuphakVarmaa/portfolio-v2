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
  /** Flash `--live` for 120 ms when the value changes (default true; skipped under lite motion). */
  flash?: boolean
  className?: string
}

/** An LED-annunciator style readout: round dots (Doto, ROND 100), fixed width, flashes on change. */
export function Readout({ label, value, width = 2, size = 'md', flash = true, className }: ReadoutProps) {
  // Count changes during render (the documented "derive state from a previous render" pattern) and use it
  // as a key, so the span remounts and its CSS animation plays once per change, never on first paint.
  const [previous, setPrevious] = useState(value)
  const [changes, setChanges] = useState(0)
  if (previous !== value) {
    setPrevious(value)
    setChanges((count) => count + 1)
  }
  return (
    <span className={cx(styles.readout, styles[`readout-${size}`], className)}>
      {label ? <span className={styles.readoutLabel}>{label}</span> : null}
      <span
        key={changes}
        className={cx(styles.readoutValue, flash && changes > 0 && styles.readoutFlash)}
        style={{ minWidth: `${width}ch` }}
      >
        {value}
      </span>
    </span>
  )
}
