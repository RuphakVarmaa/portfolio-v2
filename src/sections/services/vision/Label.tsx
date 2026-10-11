import type { ReactNode } from 'react'
import { cx } from '../../../components/ui/cx.ts'
import { usePanelContext } from '../../../components/ui/panel-context.ts'
import styles from './Vision.module.css'

/**
 * A stencil label that is also a heading, one level below the panel's own title (h3 on the home page, so
 * h4; the panel is the page's h1 on /projects/vision/, so h2). Screen-reader users can jump between
 * VIEWFINDER, QUEUE and GAUGES the way sighted readers scan the labels, and the heading order never skips.
 */
export function Label({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  const { headingLevel } = usePanelContext()
  const Tag = (['h2', 'h3', 'h4'] as const)[headingLevel - 1]
  return (
    <Tag id={id} className={cx(styles.label, className)}>
      {children}
    </Tag>
  )
}
