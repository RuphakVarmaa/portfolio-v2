import { useSyncExternalStore } from 'react'
import { announcer, EMPTY_LIVE } from '../../cluster/live-region.ts'
import styles from './shell.module.css'

/**
 * The site's live region: one polite status region (and an assertive one for the rare urgent line),
 * visually hidden. Everything is written through `announce()`, which throttles and coalesces, so
 * nothing here ever speaks faster than once per 800 ms.
 */
export function LiveRegion() {
  const live = useSyncExternalStore(announcer.subscribe, announcer.getSnapshot, () => EMPTY_LIVE)
  return (
    <>
      <div className={styles.live} role="status" aria-live="polite" aria-atomic="true">
        {live.polite}
      </div>
      <div className={styles.live} role="alert" aria-live="assertive" aria-atomic="true">
        {live.assertive}
      </div>
    </>
  )
}
