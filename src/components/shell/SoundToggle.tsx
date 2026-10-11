import { audio } from '../../cluster/audio.ts'
import { announce } from '../../cluster/live-region.ts'
import { copy } from '../../data/copy.ts'
import { Icon } from '../ui/Icon.tsx'
import { usePreferences } from './preferences-context.ts'
import styles from './shell.module.css'

/**
 * The Sound switch. The synth lives in src/cluster/audio.ts; this is only the control. Turning sound
 * on happens inside the click handler on purpose: browsers only let an AudioContext start from a user
 * gesture. Sound is never remembered: it always starts off.
 *
 * (F ships this minimal working version because the header needs it; the Chaos Lab workstream owns it
 * from here and may extend it.)
 */
export function SoundToggle({ className }: { className?: string }) {
  const { sound, setSound } = usePreferences()
  const labels = copy.header.toggles.sound

  const toggle = () => {
    const next = !sound
    audio.setEnabled(next)
    setSound(next)
    announce(next ? labels.on : labels.off)
  }

  return (
    <button type="button" className={className ?? styles.toggle} aria-pressed={sound} title={labels.title} onClick={toggle}>
      <Icon name={sound ? 'volume' : 'volume-off'} size={18} />
      <span className={styles.toggleLabel}>{labels.label}</span>
      <span className={styles.toggleLamp} aria-hidden="true" />
    </button>
  )
}
