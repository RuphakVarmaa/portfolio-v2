import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { announce } from '../../../cluster/live-region.ts'
import { formatBytes, formatMs } from '../../../cluster/format.ts'
import type { Action, Resource, Role } from '../../../cluster/protocol.ts'
import { scheduler } from '../../../cluster/scheduler.ts'
import { Button } from '../../../components/ui/Button.tsx'
import { Icon } from '../../../components/ui/Icon.tsx'
import { Meter } from '../../../components/ui/Meter.tsx'
import { usePanelContext } from '../../../components/ui/panel-context.ts'
import { PlainCaption } from '../../../components/ui/PlainCaption.tsx'
import { Readout } from '../../../components/ui/Readout.tsx'
import { Stamp } from '../../../components/ui/Stamp.tsx'
import { Select } from '../../../components/ui/Select.tsx'
import { Tape, type TapeLine } from '../../../components/ui/Tape.tsx'
import { SoftText, TapeText } from '../../../components/ui/TapeText.tsx'
import { copy, projectFor } from '../../../data/copy.ts'
import type { EvaluateResult } from '../../../lib/policy/engine.ts'
import { FUZZ_BATCHES, FUZZ_BATCH_SIZE, type FuzzRunState } from '../../../lib/policy/fuzz-run.ts'
import { ACTIONS, DATA_TENANT, RESOURCES, ROLES, TENANTS, type Tenant } from '../../../lib/policy/rulebook.ts'
import { FuzzMeter } from './FuzzMeter.tsx'
import { Ladder } from './Ladder.tsx'
import { NodeLamps } from './NodeLamps.tsx'
import styles from './Policy.module.css'
import { policyStore, type TapeEntry } from './policy-store.ts'
import { Rulebook } from './Rulebook.tsx'
import { POLICY_STRINGS as t, label } from './strings.ts'

/**
 * The policy playground (spec 3.3c, 4.5), lazy-loaded by DemoSlot. Four native selects ask the policy
 * worker, one real `policy.evaluate` job per change (no submit button); the answer is the verdict stamp, the
 * relay ladder that shows which check decided it, and a line on the audit tape that is exactly what the
 * production system would write. Below it, the fuzz: 10,000 requests across the two policy workers, and the
 * "pull the plug mid-fuzz" button that terminates policy-b while it holds a batch.
 *
 * Every number on this panel is measured by code that ran: the verdict by the worker, the counts and times by
 * the batches, the retry and its recovery time by the scheduler.
 *
 * The first verdict, asked for when the playground appears, is shown but not announced: nobody did anything
 * yet. Every later one is announced, because the visitor changed a selector.
 */

interface Selection {
  /** Who is asking: the actor's tenant. The records belong to `DATA_TENANT`. */
  tenant: Tenant
  role: Role
  resource: Resource
  action: Action
}

const DEFAULT: Selection = { tenant: DATA_TENANT, role: 'member', resource: 'project', action: 'write' }

interface Verdict {
  /** Which selection this answers, so a late answer to an old selection is not shown as the current one. */
  selection: Selection
  /** Counts answers; the stamp and the ladder are keyed by it so they are drawn again on every new answer. */
  seq: number
  result: EvaluateResult
  why: string
}

const POOL = ['policy-a', 'policy-b'] as const
const TOTAL = FUZZ_BATCHES * FUZZ_BATCH_SIZE

const grouped = (n: number) => n.toLocaleString('en-US')

/** A tape entry as the Tape draws it: the same text (the Tape breaks it between fields, see TapeText). */
const tapeLine = (entry: TapeEntry): TapeLine => ({ id: entry.id, tone: entry.tone, text: entry.text })

/** The headline of a fuzz: a status while it runs, the spec's result line when it ends. */
function headlineOf(run: FuzzRunState, demo: typeof copy.services.policy.demo): string {
  const summary = run.summary
  if (run.status === 'done' && summary) {
    return demo.fuzzResult({ leaks: summary.leaks, evaluated: summary.evaluated, perSecond: summary.perSecond, p95ms: summary.p95ms })
  }
  if (run.status === 'failed') return t.runFailed(run.error ?? 'unknown')
  if (run.status === 'preparing') return t.preparing
  return t.running(run.evaluated, TOTAL)
}

export default function Playground() {
  const demo = copy.services.policy.demo
  const project = projectFor('policy')
  const { headingLevel, standalone } = usePanelContext()
  const SubHeading = (['h2', 'h3', 'h4'] as const)[headingLevel - 1]
  const fuzzTitleId = useId()

  const [selection, setSelection] = useState<Selection>(DEFAULT)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const store = useSyncExternalStore(policyStore.subscribe, policyStore.getSnapshot, policyStore.getServerSnapshot)
  /** Set by the visitor changing a selector; the verdict for the opening selection is not announced. */
  const touched = useRef(false)

  // One real evaluation per change of the selection. A change while one is in flight cancels it.
  useEffect(() => {
    const request = { tenant: selection.tenant, actorTenant: selection.tenant, role: selection.role, resource: selection.resource, action: selection.action, resourceTenant: DATA_TENANT }
    const handle = scheduler.submit('policy.evaluate', request)
    let live = true
    handle.promise.then(
      (answer) => {
        if (!live) return
        const result = answer as EvaluateResult
        const why = t.why({ allow: result.allow, stop: result.stop, policy: result.policy, role: selection.role, resource: selection.resource, action: selection.action, actorTenant: selection.tenant, dataTenant: DATA_TENANT })
        setVerdict((previous) => ({ selection, seq: (previous?.seq ?? 0) + 1, result, why }))
        setProblem(null)
        policyStore.addTape([policyStore.line(result.audit, result.allow ? 'cobalt' : 'live')])
        if (touched.current) announce(t.announced(result.allow, why))
      },
      (error: unknown) => {
        if (!live || (error instanceof Error && error.name === 'AbortError')) return
        setProblem(error instanceof Error ? error.message : String(error))
      },
    )
    return () => {
      live = false
      handle.cancel()
    }
  }, [selection])

  const tape = useMemo(() => store.tape.map(tapeLine), [store.tape])
  const run = store.run
  const summary = run?.summary
  const finished = run?.status === 'done' && summary !== undefined
  const pending = verdict === null || verdict.selection !== selection
  const recovery = summary?.recoveries[0]
  const recovered = recovery && run ? run.batches[recovery.batch - 1] : undefined

  const field = (name: keyof Selection, values: readonly string[], text: string) => (
    <label className={styles.field}>
      <span className="stencil">{text}</span>
      <Select
        value={selection[name]}
        onChange={(event) => {
          touched.current = true
          setSelection({ ...selection, [name]: event.target.value } as Selection)
        }}
      >
        {values.map((value) => (
          <option key={value} value={value}>
            {name === 'tenant' ? value : label(value)}
          </option>
        ))}
      </Select>
    </label>
  )

  return (
    <div className={styles.playground}>
      <header className={styles.head}>
        <SubHeading className={styles.title}>{demo.label}</SubHeading>
        <NodeLamps nodes={POOL} label={t.workersLabel} />
      </header>

      <p className={styles.note}>{t.dataNote(DATA_TENANT)}</p>
      <div className={styles.fields}>
        {field('tenant', TENANTS, demo.selectors.tenant)}
        {field('role', ROLES, demo.selectors.role)}
        {field('resource', RESOURCES, demo.selectors.resource)}
        {field('action', ACTIONS, demo.selectors.action)}
      </div>
      <p className={styles.hint}>{t.hint}</p>

      <div className={styles.verdict} aria-busy={pending || undefined}>
        {verdict ? (
          <>
            <div className={styles.stampCell}>
              <Stamp key={verdict.seq} size="lg" tone={verdict.result.allow ? 'cobalt' : 'live'} shape={<Icon name={verdict.result.allow ? 'check' : 'close'} size={24} />} animate>
                {verdict.result.allow ? demo.allow : demo.deny}
              </Stamp>
              <p className={styles.policyLine}>
                <PolicyLine policy={verdict.result.policy} />
              </p>
            </div>
            <div className={styles.ladderWrap}>
              <Ladder key={verdict.seq} stop={verdict.result.stop} allow={verdict.result.allow} />
              <p className={styles.why}>{verdict.why}</p>
              <p className={styles.engine}>
                <SoftText text={pending ? (problem ?? t.asking) : t.engineTime(verdict.result.us, verdict.result.runs, verdict.result.node)} />
              </p>
            </div>
          </>
        ) : (
          <p className={styles.engine}>{problem ?? t.asking}</p>
        )}
      </div>

      <Rulebook tenant={selection.tenant} role={selection.role} resource={selection.resource} action={selection.action} initiallyOpen={standalone} />

      <Tape
        label={t.tapeLabel}
        header={demo.tapeHeader}
        lines={tape}
        empty={t.tapeEmpty}
      />

      <section className={styles.fuzz} aria-labelledby={fuzzTitleId}>
        <p className="stencil" id={fuzzTitleId}>
          {t.fuzzHeading}
        </p>
        <p className={styles.note}>{t.fuzzLead}</p>
        <div className={styles.actions}>
          <Button variant="primary" icon={<Icon name="play" />} busy={store.busy} onClick={() => void policyStore.start({ plug: false })}>
            {demo.fuzzButton}
          </Button>
          <Button variant="danger" icon={<Icon name="plug" />} busy={store.busy} onClick={() => void policyStore.start({ plug: true })}>
            {demo.plugButton}
          </Button>
        </div>
        <p className={styles.hint}>
          <SoftText text={t.plugNote} />
        </p>

        {run ? (
          <div className={styles.fuzzGrid}>
            <div className={styles.dial}>
              {/* A leak would be the news, so the needle throws (with its overshoot) only then; at 0 it just sits at 0.
                  SPEC-GAP: Meter loads GSAP when it mounts even if the needle never moves (36 KB gzip, Flip included); `instant`
                  avoids that here. F could load it only on the first real change of `value`. */}
              <Meter label={project.metrics[2].label} value={run.leaks} min={0} max={10} warn={1} instant={run.leaks === 0} />
            </div>
            <div className={styles.fuzzBody}>
              <p className={styles.resultLine} data-state={run.status}>
                <TapeText text={headlineOf(run, demo)} />
              </p>
              {recovery ? (
                <p className={styles.recovery}>
                  <TapeText text={recovery.sentence} />
                </p>
              ) : null}
              <FuzzMeter batches={run.batches} />
              <dl className={styles.stats}>
                <Stat label={t.stats.evaluated} value={grouped(run.evaluated)} width={6} />
                <Stat label={t.stats.across} value={summary ? grouped(summary.crossTenant) : '—'} width={6} />
                <Stat label={t.stats.allowed} value={summary ? grouped(summary.allowed) : '—'} width={6} />
                <Stat label={t.stats.denied} value={summary ? grouped(summary.denied) : '—'} width={6} />
                <Stat label={t.stats.perSecond} value={summary ? grouped(summary.perSecond) : '—'} width={7} />
                <Stat label={t.stats.p95} value={summary ? formatMs(summary.p95ms) : '—'} width={7} />
                <Stat label={t.stats.wall} value={summary ? formatMs(summary.wallMs) : '—'} width={7} />
                <Stat label={t.stats.audit} value={summary ? formatBytes(summary.auditBytes) : '—'} width={7} />
              </dl>
              {finished && summary ? (
                <>
                  <PlainCaption>
                    {t.plainFuzz({ crossTenant: summary.crossTenant, evaluated: summary.evaluated, leaks: summary.leaks })}
                    {recovery && recovered?.attempts[0] ? (
                      <>
                        {' '}
                        <SoftText text={t.plainPlug({ node: recovered.attempts[0].node, batch: recovery.batch, retryNode: recovery.node, ms: recovery.ms, evaluated: summary.evaluated })} />
                      </>
                    ) : null}
                  </PlainCaption>
                  <p className={styles.runCaption}>{t.runCaption(run.id, run.seed, new Date(summary.finishedAt).toLocaleTimeString('en-GB'))}</p>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

/** `policy=audit.immutable`: on a 320 px phone it is wider than its box, so it may break after the `=` and nowhere else. */
function PolicyLine({ policy }: { policy: string }) {
  const text = t.policyLine(policy)
  const equals = text.indexOf('=') + 1
  return (
    <>
      {text.slice(0, equals)}
      <wbr />
      {text.slice(equals)}
    </>
  )
}

/**
 * One counter of the fuzz summary: the figure over its stencil label. The figure is Martian Mono bold, the face the
 * meter's own readout uses (Readout's `face="mono"`), set from the left so its edge lines up with the label's.
 * Doto is for NODES, TERM and UP: at 16 px its one-bit dots read lighter than the 13 px label under them, which
 * turned the hierarchy upside down, and its decimal point is a plus-shaped cluster (`1.23 MB` read as `1+23`).
 * `width` is in characters of the mono face (0.7 em each, so 7 is 78 px: it must stay under the 85 px column the
 * four-up grid gets beside the dial).
 */
function Stat({ label: text, value, width }: { label: string; value: string; width: number }) {
  return (
    <div className={styles.stat}>
      <dt className="stencil">{text}</dt>
      <dd className={styles.statValue}>
        <Readout value={value} width={width} size="sm" face="mono" align="start" />
      </dd>
    </div>
  )
}
