import type { Action, Resource, Role } from '../../cluster/protocol.ts'

/**
 * The policy rulebook (spec 6.8) as data. Everything that needs to know "who may do what" reads this one
 * table: the engine decides from it, the static no-JS fallback prints it, the Playground labels its
 * selectors from it. It has no logic and no imports at runtime, so it is safe in the entry chunk.
 *
 *   Rule 0 (row-level): the actor's tenant must equal the row's tenant. Always first.
 *   Then the rule for (resource, action): either a minimum role, or locked for everybody.
 */

export const TENANTS = ['A', 'B', 'C'] as const
export type Tenant = (typeof TENANTS)[number]

/** Lowest to highest. A role may do whatever a lower role may do. */
export const ROLES: readonly Role[] = ['viewer', 'member', 'admin', 'owner']
export const RESOURCES: readonly Resource[] = ['project', 'task', 'audit-log', 'billing']
export const ACTIONS: readonly Action[] = ['read', 'write', 'delete', 'share']

export const ROLE_RANK: Readonly<Record<Role, number>> = { viewer: 0, member: 1, admin: 2, owner: 3 }

/** `min`: allowed for that role and above. `locked`: nobody may, the value is the policy id that says so. */
export type Rule = { readonly min: Role } | { readonly locked: string }

export const RULES: Readonly<Record<Resource, Readonly<Record<Action, Rule>>>> = {
  project: { read: { min: 'viewer' }, write: { min: 'member' }, share: { min: 'member' }, delete: { min: 'admin' } },
  task: { read: { min: 'viewer' }, write: { min: 'member' }, share: { min: 'member' }, delete: { min: 'member' } },
  'audit-log': {
    read: { min: 'admin' },
    write: { locked: 'audit.immutable' },
    delete: { locked: 'audit.immutable' },
    share: { locked: 'audit.immutable' },
  },
  billing: { read: { min: 'admin' }, write: { min: 'owner' }, delete: { locked: 'billing.no-delete' }, share: { locked: 'billing.no-share' } },
}

/** The id the audit line carries when the row-level rule refuses a request. */
export const RLS_POLICY = 'rls.tenant'

/** The id of the rule that decided, for a rule that is about a role: `project.write`. */
export const policyFor = (resource: Resource, action: Action): string => `${resource}.${action}`

/** In the Playground the records belong to this tenant; the visitor picks who is asking. */
export const DATA_TENANT: Tenant = 'A'
