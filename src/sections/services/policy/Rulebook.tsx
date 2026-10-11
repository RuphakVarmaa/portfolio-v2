import { useMemo } from 'react'
import type { Action, Resource, Role } from '../../../cluster/protocol.ts'
import { bracket, circle } from '../../../lib/draw/paths.ts'
import { decide } from '../../../lib/policy/engine.ts'
import { ACTIONS, DATA_TENANT, ROLES, type Tenant } from '../../../lib/policy/rulebook.ts'
import disclosure from './Disclosure.module.css'
import styles from './Policy.module.css'
import { POLICY_STRINGS as t, label } from './strings.ts'

/**
 * The rulebook as a patch bay: one row per role, one column per action, a plugged jack where the role may and an
 * empty one where it may not, for the resource and the tenant chosen above. The red corners mark the request being
 * decided. Every jack is the engine's own answer for that role, resource and action (`decide`), not a copy of
 * the rules, so the matrix and the verdict can never disagree. When the asking tenant is not the one that owns
 * the records, rule 0 refuses everything and every jack is empty.
 *
 * A real table (row and column headers, one word per jack for screen readers); the drawing is decoration.
 */

const JACK = 32

function Jack({ allow, current, seed }: { allow: boolean; current: boolean; seed: string }) {
  return (
    <svg className={styles.jack} viewBox={`0 0 ${JACK} ${JACK}`} width={JACK} height={JACK} aria-hidden="true">
      <path className={allow ? styles.jackOn : styles.jackOff} d={circle(16, 16, allow ? 9 : 8)} />
      {allow ? <path className={styles.jackPin} d={circle(16, 16, 3.2)} /> : null}
      {current ? <path className={styles.jackNow} d={bracket(2, 2, 28, 28, 8, seed)} /> : null}
    </svg>
  )
}

export interface RulebookProps {
  tenant: Tenant
  role: Role
  resource: Resource
  action: Action
  /** Open to begin with (the project page opens it; the home page leaves it closed). */
  initiallyOpen?: boolean
}

export function Rulebook({ tenant, role, resource, action, initiallyOpen }: RulebookProps) {
  const cross = tenant !== DATA_TENANT
  const rows = useMemo(
    () =>
      ROLES.map((who) => ({
        role: who,
        cells: ACTIONS.map((what) => ({
          action: what,
          allow: decide({ tenant, actorTenant: tenant, role: who, resource, action: what, resourceTenant: DATA_TENANT }).allow,
        })),
      })),
    [tenant, resource],
  )
  return (
    <details className={disclosure.box} open={initiallyOpen}>
      <summary>{t.rulebookSummary(label(resource))}</summary>
      <div className={`${disclosure.body} ${styles.rulebookBody}`}>
        <table className={styles.matrix}>
          <caption className="sr-only">{t.matrixCaption(label(resource), tenant, DATA_TENANT)}</caption>
          <thead>
            <tr>
              <td />
              {ACTIONS.map((what) => (
                <th key={what} scope="col" data-current={what === action || undefined}>
                  {label(what)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.role}>
                <th scope="row" data-current={row.role === role || undefined}>
                  {label(row.role)}
                </th>
                {row.cells.map((cell) => {
                  const current = row.role === role && cell.action === action
                  return (
                    <td key={cell.action} aria-current={current || undefined}>
                      <Jack allow={cell.allow} current={current} seed={`rulebook:now:${tenant}`} />
                      <span className="sr-only">
                        {cell.allow ? t.jack.allowed : t.jack.refused}
                        {current ? `, ${t.jack.current}` : ''}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.hint}>{cross ? t.matrixCross(tenant, DATA_TENANT) : t.matrixKey}</p>
      </div>
    </details>
  )
}
