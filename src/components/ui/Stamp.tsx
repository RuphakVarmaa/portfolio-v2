import type { ReactNode } from 'react'
import { cx } from './cx.ts'
import styles from './ui.module.css'

export interface StampProps {
  children: ReactNode
  /** `ink` (default), `cobalt` (allow / connection), `live` (deny, happening now). */
  tone?: 'ink' | 'cobalt' | 'live'
  /**
   * `sm` 13 px, always ink text (a tone only colours the border); `md` 18 px and `lg` 28 px may carry
   * the tone as text colour, because the palette allows vermilion text from 18 px up.
   */
  size?: 'sm' | 'md' | 'lg'
  /** Degrees. Default -6. */
  rotate?: number
  /** A leading shape (an SVG glyph) so meaning never rests on colour alone, e.g. the tier diamond. */
  shape?: ReactNode
  /** Play the stamp-down animation when it appears (skipped under lite motion). */
  animate?: boolean
  as?: 'span' | 'div'
  className?: string
  title?: string
}

/**
 * A rubber stamp: stencil face, 1.5 px border with a second outline, tilted. Used for PORT, RULES ONLY,
 * ALLOW / DENY, CERTIFIED OPERATOR, severity tiers, "backpressure engaged".
 */
export function Stamp({ children, tone = 'ink', size = 'md', rotate = -6, shape, animate, as: Tag = 'span', className, title }: StampProps) {
  return (
    <Tag
      className={cx(styles.stamp, styles[`stamp-${tone}`], styles[`stamp-${size}`], animate && styles.stampIn, className)}
      style={{ transform: `rotate(${rotate}deg)` }}
      title={title}
    >
      {shape ? (
        <span className={styles.stampShape} aria-hidden="true">
          {shape}
        </span>
      ) : null}
      {children}
    </Tag>
  )
}
