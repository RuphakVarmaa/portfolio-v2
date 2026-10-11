import { Readout } from '../../components/ui/Readout.tsx'
import { copy } from '../../data/copy.ts'
import styles from './ChaosLab.module.css'

/** `NODES 2  TERM 2` in Doto, in the order the masthead, the relay and the strip read: the term increments on every election, in every tab that sees it. */
export function TermCounter({ term, nodes }: { term: number; nodes: number }) {
  const started = term > 0
  const t = copy.header.readout
  return (
    <div className={styles.readouts} role="group" aria-label={t.label}>
      <Readout label={t.nodes} value={started ? nodes : 1} size="lg" width={2} />
      <Readout label={t.term} value={started ? term : '—'} size="lg" width={2} />
    </div>
  )
}
