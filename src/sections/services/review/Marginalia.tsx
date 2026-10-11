import type { Finding } from '../../../cluster/protocol.ts'
import { Stamp } from '../../../components/ui/Stamp.tsx'
import { copy } from '../../../data/copy.ts'
import styles from './Review.module.css'
import { REVIEW_STRINGS as t } from './strings.ts'
import { TierShape } from './TierShape.tsx'

/**
 * The reviewer's notes in the margin of one line: a tier stamp (shape and label, never colour alone), the
 * rule id, what is wrong and the one-line fix. Most severe first. A finding that spans lines says so.
 */
export function Marginalia({ findings }: { findings: readonly Finding[] }) {
  const tiers = copy.services.review.demo.tiers
  return (
    <ul className={styles.notes}>
      {findings.map((finding) => (
        <li key={finding.ruleId} className={styles.note}>
          <div className={styles.noteHead}>
            <Stamp size="sm" tone={finding.tier <= 2 ? 'live' : 'ink'} rotate={-3} shape={<TierShape tier={finding.tier} />}>
              {`T${finding.tier} ${tiers[finding.tier - 1].name}`}
            </Stamp>
            <code className={styles.rule}>{finding.ruleId}</code>
            {finding.endLine !== undefined ? <span className={styles.span}>{t.lines(finding.line, finding.endLine)}</span> : null}
          </div>
          <p className={styles.noteMessage}>{finding.message}</p>
          <p className={styles.noteFix}>
            <span className="stencil">{t.fix}</span> {finding.fix}
          </p>
        </li>
      ))}
    </ul>
  )
}
