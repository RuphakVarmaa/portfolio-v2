import { useMemo, useSyncExternalStore } from 'react'
import type { Stage } from '../../../cluster/protocol.ts'
import { scheduler } from '../../../cluster/scheduler.ts'
import { DemoSlot } from '../../../components/ui/DemoSlot.tsx'
import { usePanelContext } from '../../../components/ui/panel-context.ts'
import { ServicePanel } from '../../../components/ui/ServicePanel.tsx'
import { copy } from '../../../data/copy.ts'
import { projects } from '../../../data/portfolio.ts'
import { getSchematic } from '../../../data/schematics.ts'
import { ACTIONS, RESOURCES, RULES, type Rule } from '../../../lib/policy/rulebook.ts'
import { durationFormatter, formatDuration } from '../../../lib/review/timing.ts'
import styles from './Policy.module.css'
import { policyStore } from './policy-store.ts'

/**
 * SERVICE 03: Multi-Tenant RBAC Platform, as an honest in-browser port (spec 3.3c). The panel and its
 * schematic live here, in the entry chunk; the playground, the audit tape and the fuzz are a lazy chunk
 * (`Playground.tsx`) that DemoSlot loads when the panel is near the viewport. The policy engine itself runs
 * in the policy workers, never on the main thread.
 *
 * What the schematic shows is honest about the port: its parts light up only after a real fuzz, each with the
 * time that fuzz measured for its stage, and the parts the port does not have (the JWT, the Node.js API, the
 * database indexes) stay dark. "Show me the pipeline" runs that fuzz and then replays its three stages one at
 * a time, in slow motion, so the order can be followed.
 */

const lead = 'The playground runs in two web workers in your browser. This is the rulebook it applies.'
const rule0 = 'Rule 0, checked first: a request from one tenant for another tenant’s rows is always refused.'
const legend = 'Each action lists the lowest role that may do it; higher roles may too.'
const moreOnProject = 'The full rulebook is on the project page.'
const stageNote =
  'In the pipeline drawing, lit parts are what this port ran in the latest fuzz, with the time each stage took, summed over the ten batches: three passes over every batch. The dark parts (the JWT, the Node.js API and the tenant-scoped indexes) are production only: the port has no tokens, no server and no database. The browser clock is coarse, so the smallest times are approximate.'
/** Slow motion: the pacing is for people, the names and times are the run's own. */
const replayNote = (wallMs: number | undefined): string =>
  `Slow motion: the stages are lit one at a time so you can follow the order.${wallMs === undefined ? '' : ` The whole fuzz took ${formatDuration(wallMs)}.`} Each time shown is what the fuzz measured.`

/** The stage this port runs, and the part of the production pipeline it stands in for. */
const STAGE_NODE: Readonly<Record<string, string>> = {
  verify: 'rls',
  evaluate: 'evaluator',
  audit: 'audit',
}

const ruleText = (rule: Rule): string => ('min' in rule ? rule.min : 'nobody')

/**
 * SPEC-GAP: DemoSlot swaps the fallback for the demo without holding a height, which shifts the page below it
 * (CLS 0.06 to 0.12 on a tall viewport). Both services hold the place themselves in their stylesheets with
 * measured heights; F could give DemoSlot a `reserve` prop (or a CSS variable) so every demo does it the same way.
 *
 * What the prerender, the Basic tier and a failed load show in the demo area: no invented numbers, just the
 * rules. While the demo is on its way it also holds the demo's place (`data-reserve`, and `data-open` on the
 * project page, where the rulebook starts open; see the stylesheet), so the page below does not jump when the
 * playground appears.
 */
function Fallback({ reserve }: { reserve: boolean }) {
  const { standalone } = usePanelContext()
  return (
    <div className={styles.hold} data-reserve={reserve || undefined} data-open={standalone || undefined}>
      <div className={styles.fallback}>
        <p className={styles.note}>{lead}</p>
        {standalone ? (
          <>
            <p className={styles.note}>{rule0}</p>
            <p className={styles.note}>{legend}</p>
            <dl className={styles.rules}>
              {RESOURCES.map((resource) => (
                <div key={resource}>
                  <dt className="stencil">{resource.replace('-', ' ')}</dt>
                  <dd>{ACTIONS.map((action) => `${action}: ${ruleText(RULES[resource][action])}`).join(' · ')}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className={styles.note}>
            <a href={projects[2].route}>{moreOnProject}</a>
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * The parts this port runs light up with the time a real fuzz measured for them; the others stay dark. The times are
 * printed with the formatter the stage list uses too (`format`: one unit and two figures for the set), so a part of the
 * drawing and its row in the list always read the same.
 */
function schematicFor(stages: readonly Stage[], format: (ms: number) => string) {
  const annotations: Record<string, string> = {}
  const active: string[] = []
  for (const stage of stages) {
    const node = STAGE_NODE[stage.name]
    if (!node) continue
    active.push(node)
    annotations[node] = format(stage.ms)
  }
  return { ...getSchematic('policy'), active, annotations }
}

const subscribeNothing = () => () => undefined

export function PolicyService() {
  const state = useSyncExternalStore(policyStore.subscribe, policyStore.getSnapshot, policyStore.getServerSnapshot)
  // Server and first client render agree (true); the real answer arrives right after hydration.
  const workers = useSyncExternalStore(subscribeNothing, () => scheduler.isSupported(), () => true)
  // During a slow-motion replay only the stages revealed so far are lit and listed.
  const visible = useMemo(() => (state.shown === null ? state.stages : state.stages.slice(0, state.shown)), [state.stages, state.shown])
  // Built from all three stages of the run, not from the ones revealed so far, so the unit does not change mid-replay.
  const format = useMemo(() => durationFormatter(state.stages.map((stage) => stage.ms)), [state.stages])
  const schematic = useMemo(() => schematicFor(visible, format), [visible, format])
  const fallback = <Fallback reserve={workers} />
  return (
    <ServicePanel
      project={projects[2]}
      copy={copy.services.policy}
      stamp="PORT"
      schematic={schematic}
      fallback={fallback}
      demo={<DemoSlot load={() => import('./Playground.tsx')} disabled={!workers} />}
      stages={visible}
      formatStageMs={format}
      onShowPipeline={() => void policyStore.start({ plug: false, replay: true })}
      pipelineBusy={state.busy}
      demoFooter={
        state.stages.length > 0 ? (
          <>
            {state.shown === null ? null : <p className={styles.note}>{replayNote(state.run?.summary?.wallMs)}</p>}
            <p className={styles.note}>{stageNote}</p>
          </>
        ) : null
      }
    />
  )
}
