import { useSvgId } from '../../components/ui/ids.ts'
import styles from './ChaosLab.module.css'

/**
 * The key to the span chart, drawn with the chart's own marks (the same classes, at the same stroke): a bar
 * cut off mid-job, the flag on a bar that ran after a retry, and the dimension line that measures recovery.
 * Decorative next to the words, so the swatches are hidden from assistive technology and the words carry it.
 */
export interface SpanLegendProps {
  cut: string
  retried: string
  recovery: string
}

export function SpanLegend({ cut, retried, recovery }: SpanLegendProps) {
  const hatch = useSvgId('legend')
  return (
    <ul className={styles.legend}>
      <li>
        <svg viewBox="0 0 40 18" width="40" height="18" aria-hidden="true">
          <defs>
            <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <path className={styles.hatchLine} d="M0 0V5" />
            </pattern>
          </defs>
          <path className={styles.barKilled} fill={`url(#${hatch})`} d="M3 3H30L26 6.5L30 9.75L26 13L30 16.25H3Z" />
          <path className={styles.cross} d="M30 4l7 9M37 4l-7 9" />
        </svg>
        <span>{cut}</span>
      </li>
      <li>
        <svg viewBox="0 0 40 18" width="40" height="18" aria-hidden="true">
          <path className={styles.barOk} d="M8 3H36V16H8Z" />
          <path className={styles.retryFlag} d="M12 1H6.5V18H12" />
        </svg>
        <span>{retried}</span>
      </li>
      <li>
        <svg viewBox="0 0 40 18" width="40" height="18" aria-hidden="true">
          <path className={styles.dimExt} d="M3 2V16M37 2V16" />
          <path className={styles.dim} d="M3 11H37M3 11l5-3M3 11l5 3M37 11l-5-3M37 11l-5 3" />
        </svg>
        <span>{recovery}</span>
      </li>
    </ul>
  )
}
