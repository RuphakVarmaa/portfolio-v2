import type { ComponentPropsWithRef } from 'react'
import { cx } from './cx.ts'
import styles from './ui.module.css'

/**
 * A native `<select>` drawn the way the rest of the site is: a keycap-edged box with a hand-set chevron instead of
 * the browser's own arrow, 44 px tall, 16 px type (iOS Safari zooms the page when a field under 16 px takes focus).
 * `className` goes to the wrapper (width, grid placement); every other prop goes to the `<select>`, which keeps
 * native keyboard and screen-reader behaviour.
 */
export function Select({ className, children, ...props }: ComponentPropsWithRef<'select'>) {
  return (
    <span className={cx(styles.selectWrap, className)}>
      <select className={styles.select} {...props}>
        {children}
      </select>
    </span>
  )
}
