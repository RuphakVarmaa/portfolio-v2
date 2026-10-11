import type { ClusterSpan } from '../../cluster/scheduler.ts'
import { rewardMs } from './format.ts'
import { labels } from './labels.ts'
import { ScrollBox } from './ScrollBox.tsx'
import styles from './ChaosLab.module.css'

/**
 * The span chart as a table: the accessible twin of the picture, with the same numbers, behind a native
 * <details>. `labelOf` names a job (a batch number, a job id); times are milliseconds from the first span.
 */
export function SpansTable({ spans, labelOf, summary = labels.tableToggle }: { spans: readonly ClusterSpan[]; labelOf: (span: ClusterSpan) => string; summary?: string }) {
  if (spans.length === 0) return null
  const t0 = Math.min(...spans.map((span) => span.start))
  const rows = [...spans].sort((a, b) => a.start - b.start || a.attempts - b.attempts)
  const t = labels.table
  return (
    <details className={styles.tableBox}>
      <summary>{summary}</summary>
      <ScrollBox label={summary}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t.job}</th>
              <th scope="col">{t.node}</th>
              <th scope="col">{t.attempt}</th>
              <th scope="col">{t.start}</th>
              <th scope="col">{t.took}</th>
              <th scope="col">{t.outcome}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((span) => (
              <tr key={`${span.id}:${span.attempts}`}>
                <th scope="row">{labelOf(span)}</th>
                <td>{span.node}</td>
                <td>{span.attempts}</td>
                <td>{rewardMs(span.start - t0)}</td>
                <td>{span.end === undefined ? '—' : rewardMs(span.end - span.start)}</td>
                <td>{span.outcome ?? 'running'}{span.recoveredMs !== undefined ? `, recovered in ${rewardMs(span.recoveredMs)} ms` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollBox>
    </details>
  )
}
