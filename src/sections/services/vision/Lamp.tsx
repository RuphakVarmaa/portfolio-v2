import { LAMP_GLOW_RINGS, lamp } from '../../../lib/draw/paths.ts'
import styles from './Vision.module.css'

const LENS = 7
/** The hex-bezelled lamp, drawn once. Seeded, so it is the same pen line every time. */
const LAMP = lamp(0, 0, LENS, 'vision:live-lamp')

/**
 * A jewel lens in a hex bezel (the switchboard's own lamp): vermilion with the quantized glow while `lit`,
 * the one grey (`--lamp-off`) otherwise. It carries no meaning on its own: the word beside it does.
 */
export function Lamp({ lit }: { lit: boolean }) {
  return (
    <svg className={styles.lamp} viewBox="-20 -20 40 40" aria-hidden="true">
      {lit
        ? LAMP_GLOW_RINGS.slice(0, 3).map((ring) => <circle key={ring.k} className={styles.glow} r={LENS * ring.k} fillOpacity={ring.opacity} />)
        : null}
      <path className={styles.bezel} d={LAMP.bezel} />
      <path className={lit ? styles.lensOn : styles.lensOff} d={LAMP.lens} />
      <path className={styles.glare} d={LAMP.glare} />
    </svg>
  )
}
