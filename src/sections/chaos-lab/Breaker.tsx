import { useState, type ReactNode } from 'react'
import { announce } from '../../cluster/live-region.ts'
import { quorum } from '../../cluster/quorum.ts'
import { scheduler } from '../../cluster/scheduler.ts'
import { useClusterState, useQuorum } from '../../cluster/store.ts'
import { Button } from '../../components/ui/Button.tsx'
import { Icon } from '../../components/ui/Icon.tsx'
import { PlainCaption } from '../../components/ui/PlainCaption.tsx'
import { copy } from '../../data/copy.ts'
import { getChaos, useChaos } from './chaos.ts'
import { plugReceipts, plugReward, rewardMs } from './format.ts'
import { labels } from './labels.ts'
import { Lever } from './Lever.tsx'
import { NumberBezel } from './NumberBezel.tsx'
import type { BatchCell, PlugRun } from './plug.ts'
import { RewardLine } from './RewardLine.tsx'
import { startFuzz } from './run-fuzz.ts'
import { SpanLanes } from './SpanLanes.tsx'
import { SpansTable } from './SpansTable.tsx'
import { useOperatorStamp } from './useOperatorStamp.ts'
import styles from './ChaosLab.module.css'

/**
 * The three breakers. Each is a real experiment that ends by telling the visitor what they just proved,
 * in the exact words of `copy.chaos.experiments.*` with live values. The lever on each is a status light
 * made of metal: it shows the true state of the thing the experiment is about, so it moves because the
 * cluster changed, not because a button was pressed.
 *
 * The two buttons carry `data-chaos-key`. The stand-ins for them in index.tsx (shown until this bench has
 * loaded) carry the same key, which is how focus, or a press that came too early, is handed to the button
 * here (handoff.ts, resumed by ChaosLabLive).
 */

export type PlateState = 'ready' | 'starting' | 'running' | 'proved' | 'earlier' | 'waiting' | 'armed' | 'failed'

/** Status as a lamp and a word, with a check or a cross for the two end states: never colour alone. */
function Plate({ state }: { state: PlateState }) {
  return (
    <span className={styles.plate} data-state={state}>
      {state === 'proved' || state === 'earlier' ? (
        <Icon name="check" size={14} />
      ) : state === 'failed' ? (
        <Icon name="close" size={14} />
      ) : (
        <span className={styles.dot} aria-hidden="true" />
      )}
      {labels.status[state]}
    </span>
  )
}

function Card({ n, title, state, children }: { n: 1 | 2 | 3; title: string; state: PlateState; children: ReactNode }) {
  return (
    <li className={styles.breaker} data-state={state}>
      <header className={styles.breakerHead}>
        <NumberBezel n={n} />
        <h3 className={styles.breakerTitle}>{title}</h3>
        <Plate state={state} />
      </header>
      {children}
    </li>
  )
}

function BatchStrip({ cells }: { cells: readonly BatchCell[] }) {
  return (
    <ol className={styles.cells} aria-label={labels.batches}>
      {cells.map((cell) => (
        <li key={cell.batch} className={styles.cell} data-state={cell.state}>
          <span aria-hidden="true">{cell.batch}</span>
          <span className="sr-only">
            {`${labels.batchWord} ${cell.batch}: ${labels.stateWords[cell.state]}${cell.node ? ` on ${cell.node}` : ''}`}
          </span>
        </li>
      ))}
    </ol>
  )
}

const batchLabel = (run: PlugRun) => {
  const byId = new Map(run.jobs.map((job) => [job.id, job.batch]))
  return (span: { id: string }) => String(byId.get(span.id) ?? span.id)
}

// ---- 1. pull the plug ---------------------------------------------------------------------------

export function PlugBreaker() {
  const t = copy.chaos.experiments.plug
  const run = useChaos().plug
  const policyB = useClusterState((state) => state.nodes['policy-b']?.status)
  const supported = scheduler.isSupported()
  const running = run !== null && (run.phase === 'starting' || run.phase === 'running' || run.phase === 'recovering')
  const reward = run === null ? null : plugReward(run)
  const doneBefore = useOperatorStamp().steps.plug
  const state: PlateState = running ? 'running' : reward !== null ? 'proved' : run?.phase === 'error' ? 'failed' : doneBefore ? 'earlier' : 'ready'
  const lanes = ['policy-a', 'policy-b']

  return (
    <Card n={1} title={labels.titles.plug} state={state}>
      <Button
        variant="danger"
        size="lg"
        className={styles.leverButton}
        icon={<Lever closed={policyB === 'ready' || policyB === 'busy'} spark={policyB === 'dead'} seed="chaos:plug" />}
        busy={running}
        disabled={!supported}
        data-chaos-key="plug"
        onClick={() => {
          if (!running) void startFuzz('plug')
        }}
      >
        {t.button}
      </Button>
      <PlainCaption>{t.plain}</PlainCaption>
      {!supported ? <p className={styles.note}>{labels.needsWorkers}</p> : null}
      {run && run.batches.length > 0 ? <BatchStrip cells={run.batches} /> : null}
      {run?.phase === 'error' && run.error ? <p className={styles.problem}>{run.error}</p> : null}
      {run !== null && reward !== null ? <RewardLine text={reward} receipts={plugReceipts(run)} /> : null}
      {run && run.spans.length > 0 ? (
        <figure className={styles.figure}>
          <figcaption className="stencil">{labels.spansTitle}</figcaption>
          <SpanLanes spans={run.spans} lanes={lanes} labelOf={batchLabel(run)} label={labels.spansTitle} seed="chaos:plug:lanes" />
          <SpansTable spans={run.spans} labelOf={batchLabel(run)} />
        </figure>
      ) : null}
    </Card>
  )
}

// ---- 2. open me in another tab ----------------------------------------------------------------------

export function TabBreaker() {
  const t = copy.chaos.experiments.tab
  const q = useQuorum()
  const result = useChaos().tab
  const [clicked, setClicked] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const doneBefore = useOperatorStamp().steps.tab
  const state: PlateState = result ? 'proved' : !q.supported ? 'failed' : clicked ? 'waiting' : doneBefore ? 'earlier' : 'ready'

  const open = () => {
    getChaos().noteTabClick()
    if (quorum.openSecondTab()) {
      setBlocked(false)
      setClicked(true)
    } else {
      setBlocked(true)
      announce(copy.controlRoom.quorumPrompt.blocked)
    }
  }

  const receipts = result
    ? [
        `${result.nodes} tabs`,
        `leader ${result.leaderId}`,
        `term ${result.term}`,
        result.seenAfterMs !== null ? `seen ${result.seenAfterMs} ms after the click` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined

  return (
    <Card n={2} title={labels.titles.tab} state={state}>
      <Button
        variant="secondary"
        size="lg"
        className={styles.leverButton}
        icon={<Lever closed={q.nodes >= 2} seed="chaos:tab" />}
        disabled={!q.supported}
        data-chaos-key="tab"
        onClick={open}
      >
        {t.button}
      </Button>
      <PlainCaption>{t.plain}</PlainCaption>
      {!q.supported ? <p className={styles.note}>{copy.controlRoom.quorumPrompt.unsupported}</p> : null}
      {blocked ? <p className={styles.problem}>{copy.controlRoom.quorumPrompt.blocked}</p> : null}
      {clicked && !result && q.supported ? <p className={styles.note}>{labels.waitingForTab}</p> : null}
      {result ? <RewardLine text={t.reward({ leaderId: result.leaderId, term: result.term })} receipts={receipts} /> : null}
    </Card>
  )
}

// ---- 3. close the leader -----------------------------------------------------------------------------

export function LeaderBreaker() {
  const t = copy.chaos.experiments.leader
  const q = useQuorum()
  const result = useChaos().leader
  const doneBefore = useOperatorStamp().steps.leader
  const state: PlateState = result ? 'proved' : q.nodes >= 2 ? 'armed' : doneBefore ? 'earlier' : 'waiting'
  const receipts = result
    ? [
        `lost ${result.lostId}`,
        `new leader ${result.nodeId}${result.self ? ' (this tab)' : ''}`,
        `term ${result.term}`,
        `loss noticed to election seen in ${rewardMs(result.ms)} ms`,
      ].join(' · ')
    : undefined

  return (
    <Card n={3} title={labels.titles.leader} state={state}>
      <div className={styles.instruction}>
        <Lever closed={q.isLeader} seed="chaos:leader" />
        <p>{t.instruction(q.isLeader)}</p>
      </div>
      <PlainCaption>{t.plain}</PlainCaption>
      {q.nodes < 2 && !result ? <p className={styles.note}>{labels.needsTab}</p> : null}
      {result ? <RewardLine text={t.reward({ nodeId: result.nodeId, term: result.term })} receipts={receipts} /> : null}
    </Card>
  )
}
