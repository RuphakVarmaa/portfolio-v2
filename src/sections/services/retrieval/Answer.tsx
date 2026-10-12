import { useId, type CSSProperties, type Ref } from 'react'
import { Icon } from '../../../components/ui/Icon.tsx'
import { cx } from '../../../components/ui/cx.ts'
import { copy, type Depth } from '../../../data/copy.ts'
import type { RichHit } from '../../../lib/retrieval/types.ts'
import { serviceAnchor } from '../../../routes.ts'
import type { SearchRun } from './client.ts'
import { fmtMs } from './format.ts'
import { showsInternals } from './hit-view.ts'
import { IndexCard } from './IndexCard.tsx'
import { S } from './strings.ts'
import styles from './Retrieval.module.css'

/**
 * The answer to one question, in the order a reader wants it: a label and the question echoed once, then the
 * passages (the best one open, with its source and the link that finds it on the page), then, last, how it was measured.
 *
 * The stage timings, the round trip and the rerank line used to come before the first passage, which put the answer
 * a screen below the button that asked for it. They now sit in a disclosure under the passages: closed at the
 * 30-second depth (the default), open at Engineer and Peer, and open whenever "Show me the pipeline" has been pressed,
 * because then the visitor asked for exactly that.
 *
 * Presentational: AskTheSite owns the state, the scrolling and the announcements; this renders what it is given.
 */

/** The five measured stages as a strip: name, time, and the share of the total each took. */
function Timings({ run, pipelineShown }: { run: SearchRun; pipelineShown: boolean }) {
  const { result, roundTripMs, where } = run
  const total = result.totalMs
  return (
    <div className={styles.timings} role="group" aria-label={S.timingsLabel}>
      <ol className={styles.stages}>
        {result.stages.map((stage) => (
          <li key={stage.name} className={styles.stageCell}>
            <span className={styles.stageName}>{stage.name}</span>
            <span className={styles.stageMs}>{fmtMs(stage.ms)}</span>
            <span className={styles.stageBar} style={{ '--share': total > 0 ? Math.round((stage.ms / total) * 100) : 0 } as CSSProperties} aria-hidden="true" />
          </li>
        ))}
        <li className={cx(styles.stageCell, styles.stageTotal)}>
          <span className={styles.stageName}>{S.total}</span>
          <span className={styles.stageMs}>{fmtMs(total)}</span>
        </li>
      </ol>
      <p className={styles.timingNote}>
        {S.measuredIn[where]} · {S.roundTrip} {fmtMs(roundTripMs)} · {S.rerankNote(result.rerank)}
        {result.coldStartMs !== undefined ? ` · ${S.coldStart(result.coldStartMs)}` : ''}
      </p>
      {pipelineShown ? <p className={styles.note}>{S.drawingNote}</p> : null}
    </div>
  )
}

export interface AnswerProps {
  /** The answer's number: card keys, so a new answer never inherits the last one's open and closed states. */
  id: number
  /** What was asked, tidied (whitespace collapsed, length capped). */
  query: string
  run: SearchRun
  /** Stems of the question's words, for marking them in the passages. */
  stems: ReadonlySet<string>
  /** The depth the page shows. The engineer's rows and the open timings belong to Engineer and Peer. */
  depth: Depth
  plain: boolean
  /** The panel's heading level; the label sits two levels under it (the demo's own sub-heading is between). */
  headingLevel: 1 | 2 | 3
  /** True on a /projects/ page: a citation to a section that is not there opens the home page. */
  standalone: boolean
  /** "Show me the pipeline" was pressed: the note about the drawing is shown, and the measured details are open. */
  pipelineShown: boolean
  /** A newer question is in flight. */
  busy: boolean
  onCite: (hit: RichHit) => void
  /** The section, for scrolling it into view when it lands (reveal.ts). */
  ref?: Ref<HTMLElement>
}

export function Answer({ id, query, run, stems, depth, plain, headingLevel, standalone, pipelineShown, busy, onCite, ref }: AnswerProps) {
  const headingId = useId()
  const queryId = useId()
  const Heading = (['h3', 'h4', 'h5'] as const)[headingLevel - 1]
  const { hits, candidates } = run.result
  const deep = showsInternals(depth)
  return (
    // The section is named by its label and the question together: "Results what did ruphak do with pgvector?".
    <section ref={ref} className={styles.results} aria-labelledby={`${headingId} ${queryId}`} aria-busy={busy || undefined}>
      <div className={styles.resultsHead}>
        <Heading id={headingId} className={styles.resultsTitle}>
          {S.results}
        </Heading>
        <p className={styles.count}>{S.count(hits.length, candidates)}</p>
      </div>
      <p className={styles.queryEcho} id={queryId}>
        <span aria-hidden="true">{S.queryMark} </span>
        {query}
      </p>

      {hits.length === 0 ? (
        <div className={styles.empty}>
          <p>{copy.services.retrieval.demo.noResults}</p>
        </div>
      ) : (
        <ol className={styles.cards}>
          {hits.map((hit) => (
            <IndexCard key={`${id}:${hit.chunkId}`} hit={hit} stems={stems} depth={depth} plain={plain} away={standalone && hit.anchor !== serviceAnchor('retrieval')} onCite={onCite} />
          ))}
        </ol>
      )}

      <details className={styles.how} open={deep || pipelineShown}>
        <summary className={styles.howSummary}>
          <span className="stencil">{S.how}</span>
          <Icon name="arrow-right" size={18} className={styles.chevron} />
        </summary>
        <Timings run={run} pipelineShown={pipelineShown} />
      </details>
    </section>
  )
}
