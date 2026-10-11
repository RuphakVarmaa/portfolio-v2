import type { Action, Resource, Role } from '../../../cluster/protocol.ts'
import { RULES } from '../../../lib/policy/rulebook.ts'
import { formatDuration } from '../../../lib/review/timing.ts'

/**
 * The policy panel's own words: short UI labels and the one-sentence reasons the Playground gives. The
 * spec's prose (depth copy, captions, button text, the result line) comes from `copy.services.policy`;
 * these are the sentences the spec leaves to the build.
 * SPEC-GAP: if the owner wants every sentence in copy.ts, move this object under `copy.services.policy.ui`.
 */

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

/** `audit-log` -> `Audit log`, `viewer` -> `Viewer`. For option labels. */
export const label = (word: string): string => capital(word.replace(/-/g, ' '))
/** `audit-log` -> `audit log`. For the middle of a sentence. */
const plain = (word: string): string => word.replace(/-/g, ' ')

export const POLICY_STRINGS = {
  workersLabel: 'Policy workers',
  asking: 'Asking a policy worker…',
  dataNote: (tenant: string) => `The records here belong to tenant ${tenant}. Pick who is asking and what they want to do.`,
  hint: 'Try Tenant B or C: even an owner is refused.',
  engineTime: (us: number, runs: number, node: string) => `Decided in ${us} µs on ${node} (mean of ${runs.toLocaleString('en-US')} runs).`,
  policyLine: (policy: string) => `policy=${policy}`,

  ladderLabel: 'How the rulebook decided',
  ladder: { rls: 'Tenant', rule: 'Rule', role: 'Role', out: 'Verdict' },
  ladderState: { passed: 'passed', stopped: 'refused', skipped: 'skipped', allowed: 'allowed', denied: 'denied' },

  /** Why the verdict is what it is, from the engine's own answer (`stop`, `policy`) and the rulebook. */
  why: (input: { allow: boolean; stop: 'rls' | 'rule' | 'role' | null; policy: string; role: Role; resource: Resource; action: Action; actorTenant: string; dataTenant: string }): string => {
    const { allow, stop, policy, role, resource, action, actorTenant, dataTenant } = input
    if (stop === 'rls') {
      return `These records belong to tenant ${dataTenant} and the request comes from tenant ${actorTenant}, so the row-level rule refuses it before any role is looked at.`
    }
    if (stop === 'rule') {
      if (policy === 'audit.immutable') return 'Nobody may change, delete or share the audit log, whatever their role.'
      if (policy === 'billing.no-delete') return 'Nobody may delete billing records.'
      if (policy === 'billing.no-share') return 'Nobody may share billing records.'
      return 'No rule lets this through.'
    }
    const rule = RULES[resource][action]
    const needs = 'min' in rule ? rule.min : 'a higher role'
    return stop === 'role'
      ? `A ${role} may not ${action} ${plain(resource)} records: that needs ${needs} or above.`
      : allow
        ? `A ${role} in the same tenant may ${action} ${plain(resource)} records: ${needs} or above is enough.`
        : 'The request was refused.'
  },
  /** For the live region: the verdict and the reason in one breath. */
  announced: (allow: boolean, why: string) => `${allow ? 'Allow' : 'Deny'}. ${why}`,

  /** The rulebook as a patch bay: who may do what to the chosen resource, for the tenant that is asking. */
  rulebookSummary: (resource: string) => `The rulebook for ${resource.toLowerCase()} records`,
  matrixCaption: (resource: string, tenant: string, dataTenant: string) =>
    `Who may do what to ${resource.toLowerCase()} records of tenant ${dataTenant}, asked by tenant ${tenant}. Rows are roles, columns are actions.`,
  jack: { allowed: 'allowed', refused: 'refused', current: 'your request' },
  matrixKey: 'A filled jack means allowed, an empty one means refused. The red corners mark the request above.',
  matrixCross: (tenant: string, dataTenant: string) =>
    `Tenant ${tenant} is asking for tenant ${dataTenant}'s records, so rule 0 refuses every request before any role is looked at: every jack is empty.`,

  fuzzHeading: 'Cross-tenant fuzz',
  fuzzLead: 'Ten batches of 1,000 requests, about half of them reaching across tenants, spread over the two policy workers.',
  plugNote: 'A whole fuzz is over too quickly to time by hand, so this button pulls the plug itself, the moment policy-b is holding a batch.',
  preparing: 'Waiting for the policy workers…',
  running: (evaluated: number, total: number) => `Running: ${evaluated.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} evaluated so far…`,
  /** What the fuzz means, from what it measured. Never says more than the counts show. */
  plainFuzz: (input: { crossTenant: number; evaluated: number; leaks: number }): string => {
    const { crossTenant, evaluated, leaks } = input
    const asked = `${crossTenant.toLocaleString('en-US')} of the ${evaluated.toLocaleString('en-US')} requests asked for another company's records.`
    if (leaks > 0) return `${asked} ${leaks.toLocaleString('en-US')} of them got through, which is exactly what this test exists to catch.`
    return crossTenant === 0 ? `None of the ${evaluated.toLocaleString('en-US')} requests asked for another company's records.` : `${asked} The rulebook refused every one of them.`
  },
  /** What the unplugged run proved, from the scheduler's own record of the retry. */
  plainPlug: (input: { node: string; batch: number; retryNode: string; ms: number; evaluated: number }): string =>
    `${input.node} was unplugged while it held batch ${input.batch}. The scheduler ran that batch again on ${input.retryNode} and had its answer ${formatDuration(input.ms)} after the failure, so the fuzz still counted all ${input.evaluated.toLocaleString('en-US')} requests.`,
  ledgerLabel: 'Batches · worker, ms',
  cellState: { queued: 'queued', running: 'running', done: 'done', failed: 'failed' },
  cell: (batch: number, state: string, node: string | undefined, ms: number | undefined, retried: boolean) =>
    `Batch ${batch}: ${state}${node ? ` on ${node}` : ''}${ms !== undefined ? `, ${ms} ms` : ''}${retried ? ', retried after a plug was pulled' : ''}.`,
  stats: {
    evaluated: 'evaluated',
    across: 'across tenants',
    allowed: 'allowed',
    denied: 'denied',
    perSecond: 'evals/s',
    p95: 'p95 per batch',
    wall: 'wall time',
    audit: 'audit written',
  },
  runCaption: (id: number, seed: number, time: string) => `Run ${id} · seed ${seed} · finished at ${time}.`,
  runFailed: (message: string) => `The fuzz did not finish: ${message}.`,
  unsupported: 'Web Workers are not available in this browser, so the playground cannot run here.',
  tapeLabel: 'Audit log',
  tapeEmpty: 'no entries yet: change a selector or run the fuzz',
}
