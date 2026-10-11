import { useEffect, useSyncExternalStore } from 'react'
import { audio } from '../../cluster/audio.ts'
import { announce } from '../../cluster/live-region.ts'
import { quorum } from '../../cluster/quorum.ts'
import { scheduler } from '../../cluster/scheduler.ts'
import { copy } from '../../data/copy.ts'
import { attachSoundWiring } from '../../sections/chaos-lab/sound-wiring.ts'
import { Icon } from '../ui/Icon.tsx'
import { usePreferences } from './preferences-context.ts'
import styles from './shell.module.css'

/**
 * The Sound switch (Chaos Lab workstream, spec 4.7). The synth lives in src/cluster/audio.ts; this is the
 * control, and the one place that attaches the events that make it speak (sound-wiring.ts: a relay click
 * per protocol message, a 55 Hz hum while this tab leads, a descending two-tone on failover).
 *
 * Turning sound on happens inside the click handler on purpose: browsers only let an AudioContext start
 * from a user gesture. Sound is never remembered: it always starts off. Nothing is attached while it is
 * off, and nothing is fetched, ever: every sound is synthesized.
 */

/** Shown instead of the usual hint if the browser has no Web Audio (the switch is then disabled). */
const UNAVAILABLE = 'Sound is not available in this browser'

/** The switch is rendered more than once (header, menu, colophon): the wiring is shared and reference-counted. */
let mounts = 0
let detach: (() => void) | null = null

const documentVisibility = {
  isVisible: () => document.visibilityState === 'visible',
  subscribe: (listener: () => void) => {
    document.addEventListener('visibilitychange', listener)
    return () => document.removeEventListener('visibilitychange', listener)
  },
}

function useSoundWiring() {
  useEffect(() => {
    mounts += 1
    if (mounts === 1) detach = attachSoundWiring({ audio, scheduler, quorum, visibility: documentVisibility, now: () => performance.now() })
    return () => {
      mounts -= 1
      if (mounts === 0) {
        detach?.()
        detach = null
      }
    }
  }, [])
}

/** Web Audio exists in every browser this site supports; if it somehow does not, say so instead of pretending. */
const hasWebAudio = () => typeof AudioContext !== 'undefined'
const noSubscription = () => () => undefined

export function SoundToggle({ className }: { className?: string }) {
  const { sound, setSound } = usePreferences()
  const supported = useSyncExternalStore(noSubscription, hasWebAudio, () => true)
  const t = copy.header.toggles.sound
  useSoundWiring()

  const toggle = () => {
    const next = !sound
    audio.setEnabled(next)
    setSound(next)
    announce(next ? t.on : t.off)
  }

  return (
    <button
      type="button"
      className={className ?? styles.toggle}
      aria-pressed={sound}
      disabled={!supported}
      title={supported ? t.title : UNAVAILABLE}
      onClick={toggle}
    >
      <Icon name={sound ? 'volume' : 'volume-off'} size={18} />
      <span className={styles.toggleLabel}>{t.label}</span>
      <span className={styles.toggleLamp} aria-hidden="true" />
    </button>
  )
}
