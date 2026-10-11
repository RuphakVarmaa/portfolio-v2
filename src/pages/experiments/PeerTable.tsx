import { useEffect, useState, useSyncExternalStore } from 'react'
import { quorum, CHANNEL_NAME, HEARTBEAT_MS, LOCK_NAME, PEER_EXPIRY_MS } from '../../cluster/quorum.ts'
import { useQuorum } from '../../cluster/store.ts'
import chaos from '../../sections/chaos-lab/ChaosLab.module.css'
import { ScrollBox } from '../../sections/chaos-lab/ScrollBox.tsx'
import styles from '../Experiments.module.css'
import { tools } from './tools-copy.ts'
import { useNow } from './use-now.ts'

interface LockCounts {
  held: number
  pending: number
}

/** This tab's heartbeats: one per real 1000 ms tick of the quorum (0 on the server). */
const subscribeBeats = (listener: () => void) => (typeof window === 'undefined' ? () => undefined : quorum.onHeartbeat(listener))
const noBeats = () => 0

/**
 * The quorum, as this tab sees it: the tabs it can hear, who leads, the term, and the constants the
 * protocol runs on. Below that, what the browser itself says about the leader lock (`navigator.locks.query`),
 * asked again on every heartbeat. Open a second tab and a row appears; close the leader and the term moves.
 */
export default function PeerTable() {
  const q = useQuorum()
  const now = useNow()
  const beats = useSyncExternalStore(subscribeBeats, quorum.getHeartbeatCount, noBeats)
  const [locks, setLocks] = useState<LockCounts | 'unavailable' | null>(null)
  const t = tools.peers

  useEffect(() => {
    const manager = typeof navigator !== 'undefined' ? navigator.locks : undefined
    if (!manager || typeof manager.query !== 'function') {
      queueMicrotask(() => setLocks('unavailable'))
      return
    }
    let cancelled = false
    manager
      .query()
      .then((snapshot) => {
        if (cancelled) return
        const held = (snapshot.held ?? []).filter((lock) => lock.name === LOCK_NAME).length
        const pending = (snapshot.pending ?? []).filter((lock) => lock.name === LOCK_NAME).length
        setLocks({ held, pending })
      })
      .catch(() => {
        if (!cancelled) setLocks('unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [beats, q.term, q.nodes])

  const facts: Array<[string, string]> = [
    [t.factLabels.supported, q.supported ? t.supportedYes : t.supportedNo],
    [t.factLabels.channel, CHANNEL_NAME],
    [t.factLabels.lock, LOCK_NAME],
    [t.factLabels.heartbeat, t.ms(HEARTBEAT_MS)],
    [t.factLabels.expiry, t.ms(PEER_EXPIRY_MS)],
    [t.factLabels.beats, String(beats)],
    [t.factLabels.term, q.term > 0 ? String(q.term) : '—'],
    [t.factLabels.leader, q.leaderId ?? t.none],
  ]

  return (
    <div className={styles.stack}>
      <ScrollBox label={t.heading}>
        <table className={chaos.table}>
          <caption className="stencil">{t.heading}</caption>
          <thead>
            <tr>
              <th scope="col">{t.head.id}</th>
              <th scope="col">{t.head.role}</th>
              <th scope="col">{t.head.leader}</th>
              <th scope="col">{t.head.heard}</th>
            </tr>
          </thead>
          <tbody>
            {q.members.map((member) => (
              <tr key={member.id}>
                <th scope="row">{member.id}</th>
                <td>{member.isSelf ? t.self : t.peer}</td>
                <td>{member.isLeader ? <span className={styles.tag}>{t.yes}</span> : '—'}</td>
                <td>{member.lastSeen === null ? '—' : t.ago(Math.max(0, Math.round((now - member.lastSeen) / 1000)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollBox>

      <dl className={styles.facts} aria-label={t.facts}>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="stencil">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <p className={styles.note}>
        <span className="stencil">{t.locks}</span>{' '}
        {locks === null ? '…' : locks === 'unavailable' ? t.locksUnavailable : `${t.locksHeld} ${locks.held} · ${t.locksPending} ${locks.pending}`}
      </p>
    </div>
  )
}
