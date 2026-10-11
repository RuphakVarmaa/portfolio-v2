import { useClusterState } from '../../../cluster/store.ts'
import { copy } from '../../../data/copy.ts'
import { LAMP_GLOW_RINGS, lamp } from '../../../lib/draw/paths.ts'
import styles from './Policy.module.css'

/**
 * The workers behind a demo, as jewel lamps: lit while the node is up (ready or working), dark while it is
 * starting or unplugged, each with its state in words (and, after a plug is pulled, how many times it was
 * respawned). The state comes straight from the scheduler. Used by the policy playground (policy-a and
 * policy-b) and by the review demo (review-a); the policy styles carry the lamp drawing.
 */

const status = copy.controlRoom.board.status
const NODE_WORDS = { spawning: status.starting, ready: status.ready, busy: status.busy, dead: status.down } as const

/** The same hexagon-bezel lamp as the board, drawn once: lens radius 9 in a 56 x 56 box. */
const LAMP = lamp(28, 28, 9, 'service:lamp')

function NodeLamp({ node }: { node: string }) {
  const state = useClusterState((s) => s.nodes[node])
  const lit = state?.status === 'ready' || state?.status === 'busy'
  const word = state ? NODE_WORDS[state.status] : status.standby
  return (
    <li className={styles.lampItem} data-lit={lit || undefined}>
      <svg className={styles.lampSvg} viewBox="0 0 56 56" aria-hidden="true">
        {lit ? LAMP_GLOW_RINGS.slice(0, 3).map((ring) => <circle key={ring.k} className={styles.glow} cx="28" cy="28" r={9 * ring.k} style={{ fillOpacity: ring.opacity }} />) : null}
        <path className={styles.bezel} d={LAMP.bezel} />
        <path className={lit ? styles.lensOn : styles.lensOff} d={LAMP.lens} />
        <path className={styles.glare} d={LAMP.glare} />
      </svg>
      <span className={styles.lampWords}>
        <span className="mono">{node}</span>
        <span className="muted">
          {word}
          {state && state.respawns > 0 ? ` · respawned ×${state.respawns}` : ''}
        </span>
      </span>
    </li>
  )
}

export function NodeLamps({ nodes, label }: { nodes: readonly string[]; label: string }) {
  return (
    <ul className={styles.lamps} aria-label={label}>
      {nodes.map((node) => (
        <NodeLamp key={node} node={node} />
      ))}
    </ul>
  )
}
