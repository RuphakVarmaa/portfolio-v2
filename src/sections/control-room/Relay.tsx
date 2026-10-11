import { useClusterState, useQuorum } from '../../cluster/store.ts'
import { Readout } from '../../components/ui/Readout.tsx'
import { copy } from '../../data/copy.ts'
import { RelayArt } from './BoardSvg.tsx'
import { anyJobRunning } from './board-state.ts'
import styles from './ControlRoom.module.css'

/**
 * The control plane: a relay in the middle of the board whose recessed window carries the cluster's own
 * `NODES n  TERM t` display. The window repeats what the header shows (so it is hidden from assistive
 * technology); it prerenders the server snapshot (one node, no term yet) and goes live after hydration,
 * with the 120 ms vermilion flash the Readout gives every change.
 *
 * The arm throws from useBoardMotion, on real scheduler messages only. The coil lamp is lit while a job is
 * running on any worker (the scheduler's queue, not a timer).
 */
export function Relay() {
  const quorum = useQuorum()
  const energised = useClusterState((state) => anyJobRunning(state.queue))
  const started = quorum.term > 0
  const labels = copy.header.readout
  return (
    <div className={styles.relayBox}>
      <RelayArt energised={energised} />
      <div className={styles.relayWindow} aria-hidden="true">
        <span className={styles.relayLabel}>{copy.controlRoom.board.controlPlane}</span>
        <span className={styles.relayReadouts}>
          <Readout label={labels.nodes} value={started ? quorum.nodes : 1} width={2} size="md" />
          <Readout label={labels.term} value={started ? quorum.term : '—'} width={2} size="md" />
        </span>
      </div>
    </div>
  )
}
