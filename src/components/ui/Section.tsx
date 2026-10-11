import type { ReactNode } from 'react'
import { hexagon } from '../../lib/draw/paths.ts'
import { cx } from './cx.ts'
import styles from './ui.module.css'

export interface SectionProps {
  /** The hash target and the base of the heading id: `<section id="services">`, heading `#services-title`. */
  id: string
  /** The stencil number in the hexagon, e.g. `02`. Decorative (hidden from assistive technology). */
  label: string
  /** The h2. Rendered uppercase by the base styles. */
  title: string
  /** One short paragraph under the title. */
  lead?: ReactNode
  children?: ReactNode
  className?: string
}

/** Same hand-drawn bezel as the lamps, drawn once. Seeded, so the server and the client draw the same. */
const BEZEL = hexagon(24, 24, 20, 'section:bezel', 0.7)

/**
 * A page section: a strong ink rule, a numbered hex bezel, the h2, a lead, then your content. Wraps its
 * content in the page column. Use for every home-page section except the hero.
 */
export function Section({ id, label, title, lead, children, className }: SectionProps) {
  const titleId = `${id}-title`
  return (
    <section id={id} aria-labelledby={titleId} className={cx(styles.section, className)}>
      <div className="wrap">
        <header className={styles.sectionHead}>
          <span className={styles.sectionBezel} aria-hidden="true">
            <svg viewBox="0 0 48 48" width="48" height="48">
              <path d={BEZEL} />
            </svg>
            <span className={styles.sectionNumber}>{label}</span>
          </span>
          <h2 id={titleId} className={styles.sectionTitle} tabIndex={-1}>
            {title}
          </h2>
          {lead ? <p className={cx('lead', styles.sectionLead)}>{lead}</p> : null}
        </header>
        {children}
      </div>
    </section>
  )
}
