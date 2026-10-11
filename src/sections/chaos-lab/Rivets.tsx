import styles from './ChaosLab.module.css'

/** Four screw heads in the corners of the panel. Decorative; hidden when the machine is skipped. */
export function Rivets() {
  return (
    <span aria-hidden="true" data-machine-only="">
      <i className={styles.rivet} style={{ top: 9, left: 9, transform: 'rotate(18deg)' }} />
      <i className={styles.rivet} style={{ top: 9, right: 9, transform: 'rotate(-34deg)' }} />
      <i className={styles.rivet} style={{ bottom: 9, left: 9, transform: 'rotate(61deg)' }} />
      <i className={styles.rivet} style={{ bottom: 9, right: 9, transform: 'rotate(-12deg)' }} />
    </span>
  )
}
