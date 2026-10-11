import { useId } from 'react'
import { Icon } from '../../../components/ui/Icon.tsx'
import { FUZZ_BATCHES, type BatchRow } from '../../../lib/policy/fuzz-run.ts'
import styles from './Policy.module.css'
import { POLICY_STRINGS as t } from './strings.ts'

/**
 * The 10-segment meter (spec 4.5): one cell per batch. Each cell says, from the scheduler's own record,
 * where its batch ran, how long it took inside the worker, and whether it survived a pulled plug. A batch
 * that was cut off when policy-b was unplugged shows the plug, `b to a` (the worker it was interrupted on,
 * then the one that finished it) and a vermilion edge.
 *
 * The cells are a list: each carries one full sentence for screen readers; the drawn parts are decoration.
 */

/** 7.94 -> `7.9`, 12.4 -> `12`: the unit is in the ledger's label. */
const milliseconds = (ms: number): string => (ms < 10 ? String(Math.round(ms * 10) / 10) : String(Math.round(ms)))

/** `policy-b` -> `b`. */
const letter = (node: string | undefined): string => (node ? node.slice(node.lastIndexOf('-') + 1) : '')

export function FuzzMeter({ batches }: { batches: readonly BatchRow[] }) {
  const labelId = useId()
  const cells = Array.from({ length: FUZZ_BATCHES }, (_, index): BatchRow => batches[index] ?? { batch: index + 1, jobId: '', status: 'queued', attempts: [], retried: false })
  const done = cells.filter((cell) => cell.status === 'done').length
  return (
    <div className={styles.ledgerBox}>
      <p className="stencil" id={labelId}>
        {t.ledgerLabel}
      </p>
      <ol className={styles.ledger} aria-labelledby={labelId} data-done={done}>
        {cells.map((cell) => {
          const interrupted = cell.retried && cell.attempts.length > 1 ? letter(cell.attempts[0].node) : ''
          const route = interrupted ? `${interrupted}→${letter(cell.node)}` : letter(cell.node)
          const state = t.cellState[cell.status]
          return (
            <li key={cell.batch} className={styles.cell} data-state={cell.status} data-retried={cell.retried || undefined}>
              <span className="sr-only">{t.cell(cell.batch, state, cell.node, cell.ms, cell.retried)}</span>
              <span className={styles.cellNo} aria-hidden="true">
                {cell.batch}
              </span>
              <span className={styles.cellMark} aria-hidden="true">
                {cell.status === 'done' ? <Icon name={cell.retried ? 'plug' : 'check'} size={16} /> : cell.status === 'failed' ? <Icon name="close" size={16} /> : cell.status === 'running' ? <Icon name="play" size={14} /> : null}
              </span>
              <span className={styles.cellText} aria-hidden="true">
                {route || '·'}
              </span>
              <span className={styles.cellText} aria-hidden="true">
                {cell.ms !== undefined ? milliseconds(cell.ms) : '·'}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
