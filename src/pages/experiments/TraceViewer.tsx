import { useState } from 'react'
import { useClusterState } from '../../cluster/store.ts'
import { Button } from '../../components/ui/Button.tsx'
import { Icon } from '../../components/ui/Icon.tsx'
import { Select } from '../../components/ui/Select.tsx'
import { useChaos } from '../../sections/chaos-lab/chaos.ts'
import { lastBurst } from '../../sections/chaos-lab/lane-layout.ts'
import { startFuzz } from '../../sections/chaos-lab/run-fuzz.ts'
import { SpanLanes } from '../../sections/chaos-lab/SpanLanes.tsx'
import { ScrollBox } from '../../sections/chaos-lab/ScrollBox.tsx'
import { SpanLegend } from '../../sections/chaos-lab/SpanLegend.tsx'
import { SpansTable } from '../../sections/chaos-lab/SpansTable.tsx'
import { scheduler } from '../../cluster/scheduler.ts'
import chaos from '../../sections/chaos-lab/ChaosLab.module.css'
import styles from '../Experiments.module.css'
import { tools } from './tools-copy.ts'

type Scope = 'burst' | 'all'

/**
 * The scheduler's trace, as the scheduler recorded it: every dispatch attempt of this session, drawn as a
 * swimlane and listed as a table, plus the state of each node. Nothing here is invented; with no jobs yet
 * it says so, and offers two real runs (a fuzz, and the same fuzz with the plug pulled) so there is
 * something to look at.
 */
export default function TraceViewer() {
  const spans = useClusterState((state) => state.spans)
  const nodes = useClusterState((state) => state.nodes)
  const run = useChaos().plug
  const [scope, setScope] = useState<Scope>('burst')
  const running = run !== null && (run.phase === 'starting' || run.phase === 'running' || run.phase === 'recovering')
  const shown = scope === 'burst' ? lastBurst(spans) : spans
  const head = tools.trace.nodeHead

  return (
    <div className={styles.stack}>
      <div className={styles.controls}>
        <Button variant="secondary" icon={<Icon name="play" />} busy={running} disabled={!scheduler.isSupported()} onClick={() => !running && void startFuzz('fuzz')}>
          {tools.trace.runFuzz}
        </Button>
        <Button variant="danger" icon={<Icon name="plug" />} busy={running} disabled={!scheduler.isSupported()} onClick={() => !running && void startFuzz('plug')}>
          {tools.trace.runPlug}
        </Button>
        <label className={styles.field}>
          <span className="stencil">{tools.trace.show}</span>
          <Select value={scope} onChange={(event) => setScope(event.target.value as Scope)}>
            <option value="burst">{tools.trace.scopes.burst}</option>
            <option value="all">{tools.trace.scopes.all}</option>
          </Select>
        </label>
      </div>

      {run?.phase === 'error' && run.error ? <p className={styles.problem}>{run.error}</p> : null}

      {shown.length === 0 ? (
        <p className={styles.note}>{tools.trace.empty}</p>
      ) : (
        <figure className={styles.figure}>
          <SpanLanes
            spans={shown}
            labelOf={(span) => span.id.replace(/^j/, '')}
            label={tools.trace.chartLabel}
            seed="experiments:trace"
          />
          <SpanLegend cut={tools.trace.legend.cut} retried={tools.trace.legend.retried} recovery={tools.trace.legend.recovery} />
          <SpansTable spans={shown} labelOf={(span) => tools.trace.job(span.id, span.kind)} />
        </figure>
      )}

      {Object.keys(nodes).length > 0 ? (
        <ScrollBox label={tools.trace.nodes}>
          <table className={chaos.table}>
            <caption className="stencil">{tools.trace.nodes}</caption>
            <thead>
              <tr>
                <th scope="col">{head.node}</th>
                <th scope="col">{head.status}</th>
                <th scope="col">{head.jobs}</th>
                <th scope="col">{head.inFlight}</th>
                <th scope="col">{head.respawns}</th>
                <th scope="col">{head.rtt}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(nodes).map(([id, node]) => (
                <tr key={id}>
                  <th scope="row">{id}</th>
                  <td>{node.status}</td>
                  <td>{node.jobs}</td>
                  <td>{node.inFlight}</td>
                  <td>{node.respawns}</td>
                  <td>{node.rttMs ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      ) : null}
    </div>
  )
}
