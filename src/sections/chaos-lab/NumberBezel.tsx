import { hexagon } from '../../lib/draw/paths.ts'
import styles from './ChaosLab.module.css'

/** The hexagonal bezel with a stencil number, drawn once per breaker (seeded, so server and client agree). */
const SHAPES = [1, 2, 3].map((n) => hexagon(20, 20, 17, `chaos:bezel:${n}`, 0.7))

export function NumberBezel({ n }: { n: 1 | 2 | 3 }) {
  return (
    <span className={styles.bezel} aria-hidden="true">
      <svg viewBox="0 0 40 40" width="40" height="40">
        <path d={SHAPES[n - 1]} />
      </svg>
      <span className={styles.bezelNumber}>{n}</span>
    </span>
  )
}
