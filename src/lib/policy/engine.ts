import type { Action, JobPayload, JobResult, Resource, Role } from '../../cluster/protocol.ts'
import { hashString } from '../draw/wobble.ts'
import { ACTIONS, RESOURCES, RLS_POLICY, ROLES, ROLE_RANK, RULES, policyFor } from './rulebook.ts'

/**
 * The policy engine (spec 6.8): pure, deterministic, no clock, no randomness, no DOM. It is a TypeScript
 * port of the production policy logic; in production the same rules were enforced by PostgreSQL row-level
 * policies and JWT claims.
 *
 * A request is checked in this order and stops at the first check that refuses it:
 *
 *   1. `rls`   row-level: the actor's tenant must equal the row's tenant (rule 0, always first)
 *   2. `rule`  is there a rule that lets anyone do this to this resource? (audit-log and some billing
 *              actions are locked for everybody)
 *   3. `role`  is the actor's role high enough for the rule's minimum?
 *
 * Deny by default: a request that names a role, resource or action the rulebook does not know is refused.
 */

export type PolicyRequest = JobPayload['policy.evaluate']

/** The checks, in the order they run. The Playground draws its ladder from this. */
export type StepId = 'rls' | 'rule' | 'role'
export const STEP_ORDER: readonly StepId[] = ['rls', 'rule', 'role']

export interface Decision {
  readonly allow: boolean
  /** The id of the policy that decided: `rls.tenant`, `audit.immutable`, `project.write`, ... */
  readonly policy: string
  /** The first check that refused the request; `null` when every check passed. */
  readonly stop: StepId | null
}

/**
 * What the policy worker answers for `policy.evaluate`: the protocol's `{ allow, policy, audit, us }` plus
 * what the Playground draws (additive; the protocol type is untouched).
 */
export type EvaluateResult = JobResult['policy.evaluate'] & {
  /** The check that refused the request; `null` when every check passed. */
  stop: StepId | null
  /** `us` is the mean over this many repeated evaluations of the request (one run is far below the clock's resolution). */
  runs: number
  /** The worker that answered, e.g. `policy-b`. */
  node: string
}

/** Not in the rulebook at all: refused. */
const DENY_UNKNOWN: Decision = Object.freeze({ allow: false, policy: 'request.invalid', stop: 'rule' })
/** Rule 0. One shared frozen object: the fuzz makes thousands of these and nothing mutates a decision. */
export const DENY_RLS: Decision = Object.freeze({ allow: false, policy: RLS_POLICY, stop: 'rls' })

function ruleDecision(role: Role, resource: Resource, action: Action): Decision {
  const rule = RULES[resource][action]
  if ('locked' in rule) return Object.freeze({ allow: false, policy: rule.locked, stop: 'rule' as const })
  const policy = policyFor(resource, action)
  return ROLE_RANK[role] >= ROLE_RANK[rule.min]
    ? Object.freeze({ allow: true, policy, stop: null })
    : Object.freeze({ allow: false, policy, stop: 'role' as const })
}

/** Every same-tenant outcome, computed once from the rulebook (4 x 4 x 4). Lookups are then O(1) and allocation-free. */
const TABLE: Record<string, Record<string, Record<string, Decision>>> = {}
for (const resource of RESOURCES) {
  TABLE[resource] = {}
  for (const action of ACTIONS) {
    TABLE[resource][action] = {}
    for (const role of ROLES) TABLE[resource][action][role] = ruleDecision(role, resource, action)
  }
}

/** Rule 0: does the row belong to the actor's tenant? */
export function checkTenant(request: PolicyRequest): boolean {
  return request.actorTenant === request.resourceTenant
}

/** Rules 2 and 3 (the rule for this resource and action, then the role), for a request that passed rule 0. */
export function applyRules(request: PolicyRequest): Decision {
  return TABLE[request.resource]?.[request.action]?.[request.role] ?? DENY_UNKNOWN
}

/** The whole decision, rule 0 first. */
export function decide(request: PolicyRequest): Decision {
  return checkTenant(request) ? applyRules(request) : DENY_RLS
}

/**
 * A leak: the engine said ALLOW for a request whose actor and row are in different tenants. The fuzz
 * counts these; it must be zero, and the fuzz test proves the counter would notice if it were not.
 */
export function isLeak(request: PolicyRequest, decision: Decision): boolean {
  return decision.allow && request.actorTenant !== request.resourceTenant
}

/** A stable four-hex-digit pseudo user id for an actor, so audit lines read like real ones (`u_3fa9`). */
export function actorId(tenant: string, role: Role, serial = 0): string {
  return (hashString(`${tenant}:${role}:${serial}`) & 0xffff).toString(16).padStart(4, '0')
}

/** The row a Playground request touches: one stable, plausible row number per resource (100 to 999). */
export function rowNumberFor(resource: Resource): number {
  return 100 + (hashString(`row:${resource}`) % 900)
}

/**
 * The audit line the production system would write (spec 6.8):
 *
 *   2026-10-11T12:00:00.000Z tenant=B actor=u_3fa9(role=owner) action=write resource=project:A-417 → DENY policy=rls.tenant
 *
 * `atMs` is epoch milliseconds, passed in so the function stays pure. The row id carries the owning
 * tenant (`A-417`), so a cross-tenant line shows both tenants: the actor's in `tenant=`, the row's in the id.
 */
export function auditLine(request: PolicyRequest, decision: Decision, atMs: number, row: number, serial = 0): string {
  return (
    `${new Date(atMs).toISOString()} tenant=${request.tenant} actor=u_${actorId(request.actorTenant, request.role, serial)}(role=${request.role})` +
    ` action=${request.action} resource=${request.resource}:${request.resourceTenant}-${row}` +
    ` → ${decision.allow ? 'ALLOW' : 'DENY'} policy=${decision.policy}`
  )
}
