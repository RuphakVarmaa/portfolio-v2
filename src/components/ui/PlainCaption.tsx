import type { ReactNode } from 'react'
import { cx } from './cx.ts'
import styles from './ui.module.css'

export interface PlainCaptionProps {
  children: ReactNode
  /** The small stencil label before the text. */
  label?: string
  className?: string
}

/**
 * A plain-language caption. Mandatory on every panel (spec 4). It is always in the DOM and shown or
 * hidden by CSS (`html[data-plain='off'] [data-plain-caption]`), so it costs no hydration and the
 * toggle never re-renders the page.
 */
export function PlainCaption({ children, label = 'In plain words', className }: PlainCaptionProps) {
  return (
    <p className={cx(styles.plain, className)} data-plain-caption="">
      <span className={styles.plainLabel}>{label}</span>
      {typeof children === 'string' ? ` ${children}` : <> {children}</>}
    </p>
  )
}
