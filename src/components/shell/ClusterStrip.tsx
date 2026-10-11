import { useSyncExternalStore } from 'react'
import { quorum } from '../../cluster/quorum.ts'
import { formatUptime } from '../../cluster/format.ts'
import { useClusterState, useQuorum } from '../../cluster/store.ts'
import { copy } from '../../data/copy.ts'
import { Readout } from '../ui/Readout.tsx'
import styles from './shell.module.css'

/**
 * Whole seconds since this page loaded (the tab's uptime). One shared 1 Hz ticker, running only while
 * the strip is mounted; the value is cached per tick so getSnapshot is stable within a render.
 */
let uptimeSeconds = 0
let uptimeTimer: ReturnType<typeof setInterval> | undefined
const uptimeListeners = new Set<() => void>()
const readUptime = () => Math.floor(performance.now() / 1000)
const subscribeSecond = (listener: () => void) => {
  uptimeListeners.add(listener)
  if (uptimeTimer === undefined) {
    uptimeSeconds = readUptime()
    uptimeTimer = setInterval(() => {
      uptimeSeconds = readUptime()
      for (const l of [...uptimeListeners]) l()
    }, 1000)
  }
  return () => {
    uptimeListeners.delete(listener)
    if (uptimeListeners.size === 0 && uptimeTimer !== undefined) {
      clearInterval(uptimeTimer)
      uptimeTimer = undefined
    }
  }
}
const uptimeSnapshot = () => uptimeSeconds
const noUptime = () => null

/** This tab's heartbeats (one per 1000 ms, driven by a real timer in the quorum). 0 on the server. */
const subscribeHeartbeat = (listener: () => void) => (typeof window === 'undefined' ? () => undefined : quorum.onHeartbeat(listener))
const noHeartbeats = () => 0

/**
 * The slim sticky strip along the bottom edge: nodes, term, uptime, and the last scheduler event. It
 * keeps the system visibly running while the visitor reads. Hidden by `html[data-machine='off']`.
 * The only idle motion on the page lives here: the heartbeat lamp, which pulses once per real 1000 ms
 * heartbeat while this tab is the leader.
 */
export function ClusterStrip() {
  const state = useQuorum()
  const lastEvent = useClusterState((s) => s.lastEvent)
  const uptime = useSyncExternalStore(subscribeSecond, uptimeSnapshot, noUptime)
  const heartbeat = useSyncExternalStore(subscribeHeartbeat, quorum.getHeartbeatCount, noHeartbeats)
  const t = copy.strip
  const started = state.term > 0

  return (
    <aside className={styles.strip} aria-label={t.label} data-machine-only="" data-js-only="" data-no-print="">
      <div className={styles.stripInner}>
        <span className={styles.stripLamp} data-leader={state.isLeader || undefined} aria-hidden="true">
          <span key={state.isLeader ? heartbeat : 0} className={styles.stripLampCore} data-beat={state.isLeader && heartbeat > 0 ? '' : undefined} />
        </span>
        <span className={styles.stripReadouts}>
          <Readout label={t.nodes} value={started ? state.nodes : 1} width={2} size="sm" />
          <Readout label={t.term} value={started ? state.term : '—'} width={2} size="sm" />
          <Readout label={t.up} value={uptime === null ? '—' : formatUptime(uptime * 1000)} width={5} size="sm" flash={false} className={styles.stripUp} />
        </span>
        {started && state.isLeader ? <span className={styles.stripTag}>{t.leader}</span> : null}
        <span className={styles.stripEvent} title={lastEvent}>
          {lastEvent ?? ''}
        </span>
      </div>
    </aside>
  )
}
