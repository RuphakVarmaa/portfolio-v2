import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Action, Resource, Role } from '../../cluster/protocol.ts'
import { STEP_ORDER, actorId, applyRules, auditLine, checkTenant, decide, isLeak, rowNumberFor, type PolicyRequest } from './engine.ts'
import { ACTIONS, DATA_TENANT, RESOURCES, ROLES, RULES, TENANTS } from './rulebook.ts'

/**
 * The expectations below are the spec's rule list (6.8) written out by hand, NOT derived from `RULES`, so
 * the test fails if the rulebook ever drifts from the spec instead of agreeing with itself.
 */
const ORDER: readonly Role[] = ['viewer', 'member', 'admin', 'owner']
const atLeast = (role: Role, min: Role) => ORDER.indexOf(role) >= ORDER.indexOf(min)

/** `null` means nobody; otherwise the lowest role that may. */
const SPEC_MIN: Record<Resource, Record<Action, Role | null>> = {
  project: { read: 'viewer', write: 'member', share: 'member', delete: 'admin' },
  task: { read: 'viewer', write: 'member', share: 'member', delete: 'member' },
  'audit-log': { read: 'admin', write: null, delete: null, share: null },
  billing: { read: 'admin', write: 'owner', delete: null, share: null },
}

const request = (over: Partial<PolicyRequest> = {}): PolicyRequest => ({
  tenant: 'A',
  actorTenant: 'A',
  role: 'member',
  resource: 'project',
  action: 'write',
  resourceTenant: 'A',
  ...over,
})

test('rule 0 (row-level): a request across tenants is refused for every role, resource and action, with policy rls.tenant', () => {
  let checked = 0
  for (const actorTenant of TENANTS) {
    for (const resourceTenant of TENANTS) {
      if (actorTenant === resourceTenant) continue
      for (const role of ROLES) {
        for (const resource of RESOURCES) {
          for (const action of ACTIONS) {
            const d = decide(request({ tenant: actorTenant, actorTenant, resourceTenant, role, resource, action }))
            assert.equal(d.allow, false, `${actorTenant}->${resourceTenant} ${role} ${action} ${resource}`)
            assert.equal(d.policy, 'rls.tenant')
            assert.equal(d.stop, 'rls')
            checked += 1
          }
        }
      }
    }
  }
  assert.equal(checked, 6 * 4 * 4 * 4, 'every ordered pair of different tenants, every role, resource and action')
})

test('rule 0 comes first: an owner of another tenant is refused on a resource that would otherwise be locked for everyone', () => {
  // audit-log write is locked for all roles, but across tenants the answer is still the row-level rule.
  const d = decide(request({ actorTenant: 'B', tenant: 'B', role: 'owner', resource: 'audit-log', action: 'write' }))
  assert.deepEqual({ allow: d.allow, policy: d.policy }, { allow: false, policy: 'rls.tenant' })
})

test('same tenant: every role, resource and action matches the spec table (64 combinations)', () => {
  let checked = 0
  for (const role of ROLES) {
    for (const resource of RESOURCES) {
      for (const action of ACTIONS) {
        const min = SPEC_MIN[resource][action]
        const d = decide(request({ role, resource, action }))
        const expected = min !== null && atLeast(role, min)
        assert.equal(d.allow, expected, `${role} ${action} ${resource}`)
        checked += 1
      }
    }
  }
  assert.equal(checked, 64)
})

test('project: read viewer and up; write member and up; share member and up; delete admin and up', () => {
  const allowed = (role: Role, action: Action) => decide(request({ role, resource: 'project', action })).allow
  assert.deepEqual(ROLES.map((r) => allowed(r, 'read')), [true, true, true, true])
  assert.deepEqual(ROLES.map((r) => allowed(r, 'write')), [false, true, true, true])
  assert.deepEqual(ROLES.map((r) => allowed(r, 'share')), [false, true, true, true])
  assert.deepEqual(ROLES.map((r) => allowed(r, 'delete')), [false, false, true, true])
})

test('task: read viewer and up; write, share and delete member and up', () => {
  const allowed = (role: Role, action: Action) => decide(request({ role, resource: 'task', action })).allow
  assert.deepEqual(ROLES.map((r) => allowed(r, 'read')), [true, true, true, true])
  for (const action of ['write', 'share', 'delete'] as const) assert.deepEqual(ROLES.map((r) => allowed(r, action)), [false, true, true, true])
})

test('audit-log: read admin and up; write, delete and share are refused for everyone with policy audit.immutable', () => {
  const at = (role: Role, action: Action) => decide(request({ role, resource: 'audit-log', action }))
  assert.deepEqual(ROLES.map((r) => at(r, 'read').allow), [false, false, true, true])
  for (const action of ['write', 'delete', 'share'] as const) {
    for (const role of ROLES) {
      const d = at(role, action)
      assert.equal(d.allow, false, `${role} ${action}`)
      assert.equal(d.policy, 'audit.immutable')
      assert.equal(d.stop, 'rule', 'refused by the rule itself, before any role is compared')
    }
  }
})

test('billing: read admin and up; write owner only; delete and share refused for everyone', () => {
  const at = (role: Role, action: Action) => decide(request({ role, resource: 'billing', action }))
  assert.deepEqual(ROLES.map((r) => at(r, 'read').allow), [false, false, true, true])
  assert.deepEqual(ROLES.map((r) => at(r, 'write').allow), [false, false, false, true])
  for (const action of ['delete', 'share'] as const) {
    for (const role of ROLES) {
      const d = at(role, action)
      assert.equal(d.allow, false, `${role} ${action}`)
      assert.equal(d.stop, 'rule')
      assert.match(d.policy, /^billing\.no-(delete|share)$/)
    }
  }
})

test('the policy id of an allow or a role refusal names the rule: <resource>.<action>; the stop says which check refused', () => {
  const allow = decide(request({ role: 'admin', resource: 'project', action: 'delete' }))
  assert.deepEqual({ ...allow }, { allow: true, policy: 'project.delete', stop: null })
  const tooLow = decide(request({ role: 'member', resource: 'project', action: 'delete' }))
  assert.deepEqual({ ...tooLow }, { allow: false, policy: 'project.delete', stop: 'role' })
  assert.deepEqual(STEP_ORDER, ['rls', 'rule', 'role'])
})

test('the rulebook data agrees with the spec table too (so the static fallback prints the truth)', () => {
  for (const resource of RESOURCES) {
    for (const action of ACTIONS) {
      const rule = RULES[resource][action]
      const min = SPEC_MIN[resource][action]
      if (min === null) assert.ok('locked' in rule, `${resource}.${action} is locked`)
      else assert.deepEqual({ ...rule }, { min })
    }
  }
})

test('deny by default: a role, resource or action the rulebook does not know is refused, never allowed', () => {
  const unknown = [
    request({ role: 'superuser' as Role }),
    request({ resource: 'secrets' as Resource }),
    request({ action: 'execute' as Action }),
  ]
  for (const r of unknown) {
    const d = decide(r)
    assert.equal(d.allow, false)
    assert.equal(d.policy, 'request.invalid')
  }
})

test('applyRules and checkTenant are the two halves of decide', () => {
  const same = request({ role: 'viewer', action: 'delete' })
  const cross = request({ actorTenant: 'C', tenant: 'C', role: 'owner', action: 'read' })
  assert.equal(checkTenant(same), true)
  assert.equal(checkTenant(cross), false)
  assert.deepEqual({ ...decide(same) }, { ...applyRules(same) })
  assert.equal(decide(cross).policy, 'rls.tenant')
})

test('a leak is an ALLOW across tenants, and only that', () => {
  const cross = request({ actorTenant: 'B', tenant: 'B' })
  assert.equal(isLeak(cross, { allow: true, policy: 'x', stop: null }), true, 'a (hypothetical) allow across tenants')
  assert.equal(isLeak(cross, decide(cross)), false, 'the real engine refuses it')
  assert.equal(isLeak(request(), decide(request())), false, 'an allow inside one tenant is not a leak')
})

const AUDIT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z tenant=[ABC] actor=u_[0-9a-f]{4}\(role=(owner|admin|member|viewer)\) action=(read|write|delete|share) resource=(project|task|audit-log|billing):[ABC]-\d{3} → (ALLOW|DENY) policy=[a-z.-]+$/

test('the audit line has the exact shape from the spec, for an allow and for a refusal', () => {
  const at = Date.UTC(2026, 9, 11, 12, 0, 0, 123)
  const allowReq = request({ role: 'admin', resource: 'task', action: 'delete' })
  const allow = auditLine(allowReq, decide(allowReq), at, rowNumberFor('task'))
  assert.match(allow, AUDIT)
  assert.ok(allow.startsWith('2026-10-11T12:00:00.123Z tenant=A actor=u_'))
  assert.ok(allow.endsWith(' action=delete resource=task:A-' + rowNumberFor('task') + ' → ALLOW policy=task.delete'))

  const denyReq = request({ actorTenant: 'B', tenant: 'B', role: 'owner', resource: 'project', action: 'write', resourceTenant: DATA_TENANT })
  const deny = auditLine(denyReq, decide(denyReq), at, rowNumberFor('project'))
  assert.match(deny, AUDIT)
  assert.ok(deny.includes(' tenant=B '), 'the audit tenant is the actor session tenant')
  assert.ok(deny.includes(`resource=project:A-${rowNumberFor('project')}`), 'the row id carries the owning tenant')
  assert.ok(deny.endsWith('→ DENY policy=rls.tenant'))
})

test('audit lines, actor ids and row numbers are pure and stable', () => {
  const r = request()
  const d = decide(r)
  assert.equal(auditLine(r, d, 0, 417), auditLine(r, d, 0, 417))
  assert.equal(actorId('A', 'member', 3), actorId('A', 'member', 3))
  assert.notEqual(actorId('A', 'member', 3), actorId('B', 'member', 3))
  assert.match(actorId('C', 'owner'), /^[0-9a-f]{4}$/)
  for (const resource of RESOURCES) {
    const row = rowNumberFor(resource)
    assert.ok(row >= 100 && row <= 999, `${resource}: ${row}`)
    assert.equal(row, rowNumberFor(resource))
  }
})
