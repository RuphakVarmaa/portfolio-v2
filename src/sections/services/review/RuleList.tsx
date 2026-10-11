import { copy } from '../../../data/copy.ts'
import { RULES, RULE_IDS } from '../../../lib/review/rules.ts'
import { TIERS } from '../../../lib/review/tiers.ts'
import disclosure from '../policy/Disclosure.module.css'
import styles from './Review.module.css'
import { REVIEW_STRINGS as t } from './strings.ts'
import { TierShape } from './TierShape.tsx'

/**
 * The whole rule catalogue, in the open: every rule the reviewer has, grouped by tier (shape and label), with
 * what it flags and how it finds it (a pattern over the text, or the syntax tree). It is the catalogue itself
 * (`RULES`), not a copy of it, so the list and the reviewer cannot drift apart. The point is honesty: a short
 * list of rules is not a certificate that code is right, and here is the list.
 */

const COUNTS = RULE_IDS.reduce(
  (counts, id) => {
    counts[RULES[id].stage] += 1
    return counts
  },
  { pattern: 0, ast: 0 },
)

export function RuleList() {
  const tiers = copy.services.review.demo.tiers
  return (
    <details className={disclosure.box}>
      <summary>{t.rulesSummary(RULE_IDS.length)}</summary>
      <div className={disclosure.body}>
        <p className={styles.meta}>{t.rulesLead(COUNTS.pattern, COUNTS.ast)}</p>
        {TIERS.map((tier) => {
          const rules = RULE_IDS.filter((id) => RULES[id].tier === tier)
          return (
            <div key={tier} className={styles.ruleTier}>
              <p className={styles.ruleTierHead}>
                <TierShape tier={tier} />
                <span className="stencil">{`T${tier} ${tiers[tier - 1].name}`}</span>
              </p>
              <dl className={styles.ruleList}>
                {rules.map((id) => (
                  <div key={id} className={styles.ruleRow}>
                    <dt>
                      <code className={styles.ruleId}>{id}</code>
                      <span className={styles.ruleHow}>{t.how[RULES[id].stage]}</span>
                    </dt>
                    <dd>{RULES[id].message}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )
        })}
      </div>
    </details>
  )
}
