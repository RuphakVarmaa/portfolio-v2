import { useSyncExternalStore, type CSSProperties } from 'react'
import { quorum, type QuorumMember } from '../../cluster/quorum.ts'
import { useSvgId } from '../../components/ui/ids.ts'
import { LAMP_GLOW_RINGS, hexagon, lamp } from '../../lib/draw/paths.ts'
import type { Departed } from './chaos-store.ts'
import { labels } from './labels.ts'
import styles from './ChaosLab.module.css'

/**
 * One jewel lamp per tab in the cluster, in the same hand-drawn language as the board: a hexagonal bezel,
 * a round lens, a quantized glow (hard-stop rings, with a 1-bit dither halo in the Ink theme). A live tab
 * is lit; the LEADER carries a second bezel ring and a tag; a tab that left stays on the panel as a dark,
 * dashed lamp ("left", and "was LEADER" if it was), so a lost leader is visible after it is gone.
 *
 * The only idle motion in the lab: the LEADER's lamp sends out one ring each time its heartbeat is heard
 * (this tab's own heartbeat is a real 1000 ms timer; another tab's is the message that reached this one,
 * so its ring is timed by the peer, not by this page). Nothing else on a lamp moves, and under lite motion
 * the ring has no duration, so it never shows.
 */

const R = 12
const C = 42

/** This tab's heartbeat count: one per real 1000 ms tick of the quorum (0 on the server). */
const subscribeBeats = (listener: () => void) => (typeof window === 'undefined' ? () => undefined : quorum.onHeartbeat(listener))
const noBeats = () => 0

interface TabLampProps {
  lit: boolean
  leader: boolean
  ghost: boolean
  seed: string
  /** Changes every time a heartbeat of this (leading) tab is heard; null when the lamp does not beat. */
  beat: number | null
}

function TabLamp({ lit, leader, ghost, seed, beat }: TabLampProps) {
  const dither = useSvgId('dither')
  const parts = lamp(C, C, R, seed)
  return (
    <svg
      className={styles.tabLamp}
      viewBox="0 0 84 84"
      width="84"
      height="84"
      aria-hidden="true"
      style={{ '--dither': `url(#${dither})` } as CSSProperties}
    >
      <defs>
        <pattern id={dither} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect className={styles.ditherDot} width="2" height="2" />
        </pattern>
      </defs>
      {lit
        ? LAMP_GLOW_RINGS.slice(0, 3).map((ring, index) => (
            <circle key={ring.k} className={index === 0 ? styles.halo : styles.glow} cx={C} cy={C} r={R * ring.k} fillOpacity={ring.opacity} />
          ))
        : null}
      {/* A new key restarts the ring's animation: one ring per heartbeat heard. */}
      {lit && beat !== null ? <circle key={beat} className={styles.beat} cx={C} cy={C} r={R * 1.9} /> : null}
      {leader ? <path className={styles.lampRing} d={hexagon(C, C, parts.bezelRadius + 5, `${seed}:ring`, 0.6)} /> : null}
      <path className={styles.lampBezel} data-ghost={ghost || undefined} d={parts.bezel} />
      <path className={lit ? styles.lensLit : styles.lensOff} data-ghost={ghost || undefined} d={parts.lens} />
      <path className={styles.lampGlare} d={parts.glare} />
    </svg>
  )
}

export interface NodeLampsProps {
  members: readonly QuorumMember[]
  departed: readonly Departed[]
}

export function NodeLamps({ members, departed }: NodeLampsProps) {
  const ownBeats = useSyncExternalStore(subscribeBeats, quorum.getHeartbeatCount, noBeats)
  return (
    <ul className={styles.lampList} aria-label={labels.lampsLabel}>
      {members.map((member) => (
        <li key={member.id} className={styles.lampItem}>
          <TabLamp
            lit
            leader={member.isLeader}
            ghost={false}
            seed={`chaos:lamp:${member.id}`}
            beat={member.isLeader ? (member.isSelf ? ownBeats : member.lastSeen) : null}
          />
          <span className={styles.lampId}>{member.id}</span>
          <span className={styles.lampTags}>
            {member.isSelf ? <span className={styles.tag}>{labels.thisTab}</span> : null}
            {member.isLeader ? <span className={styles.tag} data-leader="">{labels.leaderTag}</span> : null}
          </span>
        </li>
      ))}
      {departed.map((gone) => (
        <li key={`gone:${gone.id}`} className={styles.lampItem} data-ghost="">
          <TabLamp lit={false} leader={false} ghost seed={`chaos:lamp:${gone.id}`} beat={null} />
          <span className={styles.lampId}>{gone.id}</span>
          <span className={styles.lampTags}>
            <span className={styles.tag}>{labels.left}</span>
            {gone.wasLeader ? <span className={styles.tag}>{labels.wasLeader}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}
