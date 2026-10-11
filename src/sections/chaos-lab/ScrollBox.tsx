import type { ReactNode } from 'react'
import styles from './ChaosLab.module.css'

/**
 * A box a wide table scrolls inside, instead of widening the page. A box that can scroll must be reachable
 * from the keyboard (a mouse wheel is not the only way to read the last column), so it is a labelled region
 * in the tab order; its focus ring is the site's own `:focus-visible` outline.
 */
export function ScrollBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.tableScroll} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}
