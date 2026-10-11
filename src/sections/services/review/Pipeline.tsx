import { copy } from '../../../data/copy.ts'
import type { AnalysisResult } from '../../../lib/review/analyze.ts'
import { formatDuration } from '../../../lib/review/timing.ts'
import styles from './Review.module.css'
import { REVIEW_STRINGS as t } from './strings.ts'

/**
 * The pipeline timeline (spec 4.6): the five stages of the run in order, like five relay modules in a row
 * (a column of rows on a narrow panel), each with its measured time and a bar against the slowest stage. A
 * stage that did not run says so (the AST pass, for input acorn cannot read), with the parser's own reason.
 *
 * Times are the mean of many repeated runs inside the worker (one pass is shorter than the browser clock can
 * resolve); the round trip is one measured run on this page. Both are real, and the footnote says which is
 * which. During the slow-motion replay of "Show me the pipeline" (`shown` is how many stages have been
 * revealed) the modules not yet reached wait, dashed and empty, and light one by one.
 */
export function Pipeline({ result, roundTripMs, shown }: { result: AnalysisResult; roundTripMs?: number; shown: number | null }) {
  const visible = shown ?? result.stages.length
  const total = result.stages.reduce((sum, stage) => sum + stage.ms, 0)
  // Scaled against every stage, so the bars do not rescale as the replay reveals them.
  const slowest = Math.max(...result.stages.map((stage) => stage.ms), 0)
  return (
    <div className={styles.pipeline} role="group" aria-label={t.pipelineLabel}>
      <ol className={styles.stages}>
        {result.stages.map((stage, index) => {
          const waiting = index >= visible
          const skipped = !waiting && stage.name === 'AST pass' && !result.parsed
          const width = waiting || skipped || slowest === 0 ? 0 : Math.max(3, Math.round((stage.ms / slowest) * 100))
          return (
            <li key={stage.name} className={styles.stage} data-skipped={skipped || undefined} data-waiting={waiting || undefined}>
              <span className="stencil">{stage.name}</span>
              {skipped ? (
                <span className={styles.skipped}>{copy.services.review.demo.astSkipped}</span>
              ) : (
                <span className={styles.stageMs}>{waiting ? '—' : formatDuration(stage.ms)}</span>
              )}
              <span className={styles.bar} aria-hidden="true">
                <span style={{ width: `${width}%` }} />
              </span>
            </li>
          )
        })}
      </ol>
      {!result.parsed && result.parseError ? <p className={styles.timing}>{t.parserSaid(result.parseError)}</p> : null}
      <p className={styles.timing}>
        {t.total(total)}
        {roundTripMs !== undefined ? ` · ${t.roundTrip(roundTripMs)}` : ''}
      </p>
      <p className={styles.timing}>{t.timingNote}</p>
    </div>
  )
}
