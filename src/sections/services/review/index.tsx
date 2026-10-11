import { useMemo, useSyncExternalStore } from 'react'
import type { Stage } from '../../../cluster/protocol.ts'
import { scheduler } from '../../../cluster/scheduler.ts'
import { DemoSlot } from '../../../components/ui/DemoSlot.tsx'
import { ServicePanel } from '../../../components/ui/ServicePanel.tsx'
import { copy } from '../../../data/copy.ts'
import { projects } from '../../../data/portfolio.ts'
import { getSchematic } from '../../../data/schematics.ts'
import { formatDuration } from '../../../lib/review/timing.ts'
import styles from './Review.module.css'
import { reviewStore, type ReviewState } from './review-store.ts'

/**
 * SERVICE 04: Automated Code Review Pipeline, as an honest in-browser port (spec 3.3d). The panel and its
 * schematic live here, in the entry chunk; the editor, the galley and the margin notes are a lazy chunk
 * (`Demo.tsx`) that DemoSlot loads when the panel is near the viewport; the rules run in the review worker,
 * and acorn is a chunk of the worker's own.
 *
 * Rules only, and the panel says so: the production pipeline added a structured LLM stage and ran ESLint and
 * Semgrep in a Docker stage. On the drawing, the parts this port runs light up in the order the work was done,
 * each with the time that run measured; the parts it does not run stay dark. "Show me the pipeline" reviews
 * again and then replays the five stages one at a time, in slow motion, so the order can be followed (they
 * really take microseconds, which is faster than anyone can watch).
 */

const lead = 'The reviewer runs in a web worker in your browser. Seeded diffs and pasted code get the same rules, in five tiers.'
const stageNote =
  'In the pipeline drawing, lit parts are the stages this port ran, in order, with the time each took. The pattern rules stand in for Semgrep and the AST pass for ESLint; GitHub Actions, Docker and the LLM stage are production only.'
/** Slow motion: the pacing is for people, the names and times are the run's own. */
const replayNote = (workerMs: number): string =>
  `Slow motion: the stages are lit one at a time so you can follow the order. The whole review took ${formatDuration(workerMs)} in the worker. Each time shown is what that run measured.`

/** The stage the worker reports, and the part of the production pipeline it stands in for. */
const STAGE_NODE: Readonly<Record<string, string>> = {
  parse: 'diff',
  'lint patterns': 'semgrep',
  'AST pass': 'eslint',
  tier: 'tier',
  post: 'comments',
}

/**
 * What the prerender, the Basic tier and a failed load show in the demo area: the five tiers and the seeds,
 * no invented numbers. While the demo is on its way it also holds the demo's place (`data-reserve`, see the
 * stylesheet), so the page below does not jump when the reviewer appears.
 */
function Fallback({ reserve }: { reserve: boolean }) {
  const demo = copy.services.review.demo
  return (
    <div className={styles.hold} data-reserve={reserve || undefined}>
      <div className={styles.fallback}>
        <p className={styles.meta}>{lead}</p>
        <ul className={styles.legend}>
          {demo.tiers.map((tier) => (
            <li key={tier.tier}>{tier.label}</li>
          ))}
        </ul>
        <p className={styles.meta}>{`Seeded diffs: ${demo.seeds.join(', ')}.`}</p>
      </div>
    </div>
  )
}

/**
 * The stages of the latest finished review that are on show: all of them, or those the slow-motion replay has reached.
 * Each stage time is a mean over repeats (see timing.ts), so it is real to the microsecond; ServicePanel prints
 * them with `formatDuration` (`46 µs`, `0.42 ms`) through its `formatStageMs` prop, the same as this panel's own views.
 */
function visibleStages(state: ReviewState): readonly Stage[] {
  const result = state.done?.result
  if (state.busy || !result) return []
  const upto = state.shown ?? result.stages.length
  return result.stages.slice(0, upto).filter((stage) => stage.name !== 'AST pass' || result.parsed)
}

function schematicFor(state: ReviewState) {
  const order = copy.services.review.pipeline
  const annotations: Record<string, string> = {}
  const active: string[] = []
  const running = state.run?.status === 'running' ? state.run : null
  const result = state.done?.result
  if (running) {
    // Lit in the order the worker reports its stages (a progress message as each one starts).
    const reached = order.indexOf(running.stage ?? '')
    for (let index = 0; index <= reached; index++) active.push(STAGE_NODE[order[index]])
  } else if (result) {
    const upto = state.shown ?? result.stages.length
    for (const stage of result.stages.slice(0, upto)) {
      const node = STAGE_NODE[stage.name]
      if (stage.name === 'AST pass' && !result.parsed) {
        annotations[node] = 'skipped'
        continue
      }
      active.push(node)
      annotations[node] = formatDuration(stage.ms)
    }
  }
  return { ...getSchematic('review'), active, annotations }
}

const subscribeNothing = () => () => undefined

export function ReviewService() {
  const state = useSyncExternalStore(reviewStore.subscribe, reviewStore.getSnapshot, reviewStore.getServerSnapshot)
  // Server and first client render agree (true); the real answer arrives right after hydration.
  const workers = useSyncExternalStore(subscribeNothing, () => scheduler.isSupported(), () => true)
  const schematic = useMemo(() => schematicFor(state), [state])
  const stages = useMemo(() => visibleStages(state), [state])
  const result = state.done?.result
  const workerMs = result ? result.stages.reduce((sum, stage) => sum + stage.ms, 0) : 0
  return (
    <ServicePanel
      project={projects[3]}
      copy={copy.services.review}
      stamp="RULES ONLY"
      schematic={schematic}
      fallback={<Fallback reserve={workers} />}
      demo={<DemoSlot load={() => import('./Demo.tsx')} disabled={!workers} />}
      stages={stages}
      formatStageMs={formatDuration}
      onShowPipeline={() => reviewStore.runCurrent({ replay: true })}
      pipelineBusy={state.busy}
      demoFooter={
        result ? (
          <>
            {state.shown === null ? null : <p className={styles.meta}>{replayNote(workerMs)}</p>}
            <p className={styles.meta}>{stageNote}</p>
          </>
        ) : null
      }
    />
  )
}
