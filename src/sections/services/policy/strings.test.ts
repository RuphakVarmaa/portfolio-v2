import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decide } from '../../../lib/policy/engine.ts'
import { ACTIONS, DATA_TENANT, RESOURCES, ROLES, TENANTS } from '../../../lib/policy/rulebook.ts'
import { POLICY_STRINGS as t, label } from './strings.ts'

test('labels read as words: hyphens become spaces, the first letter is a capital', () => {
  assert.equal(label('audit-log'), 'Audit log')
  assert.equal(label('viewer'), 'Viewer')
  assert.equal(label('project'), 'Project')
})

test('every verdict the engine can give has a reason that names what decided it (all 192 combinations)', () => {
  let checked = 0
  for (const actorTenant of TENANTS) {
    for (const role of ROLES) {
      for (const resource of RESOURCES) {
        for (const action of ACTIONS) {
          const request = { tenant: actorTenant, actorTenant, role, resource, action, resourceTenant: DATA_TENANT }
          const decision = decide(request)
          const why = t.why({ allow: decision.allow, stop: decision.stop, policy: decision.policy, role, resource, action, actorTenant, dataTenant: DATA_TENANT })
          const where = `${actorTenant} ${role} ${action} ${resource}`
          assert.ok(why.length > 20 && !/undefined|\[object/.test(why), `${where}: ${why}`)
          if (decision.stop === 'rls') {
            assert.ok(why.includes(`tenant ${DATA_TENANT}`) && why.includes(`tenant ${actorTenant}`), `${where}: names both tenants: ${why}`)
          } else if (decision.stop === 'rule') {
            assert.match(why, /Nobody may/, `${where}: ${why}`)
          } else if (decision.stop === 'role') {
            assert.ok(why.includes(`A ${role} may not ${action}`), `${where}: ${why}`)
          } else {
            assert.ok(why.includes(`A ${role} in the same tenant may ${action}`), `${where}: ${why}`)
          }
          checked += 1
        }
      }
    }
  }
  assert.equal(checked, 3 * 4 * 4 * 4)
})

test('a role refusal names the lowest role that would be enough, from the rulebook', () => {
  const why = t.why({ allow: false, stop: 'role', policy: 'project.delete', role: 'member', resource: 'project', action: 'delete', actorTenant: 'A', dataTenant: 'A' })
  assert.match(why, /needs admin or above/)
  const audit = t.why({ allow: false, stop: 'rule', policy: 'audit.immutable', role: 'owner', resource: 'audit-log', action: 'write', actorTenant: 'A', dataTenant: 'A' })
  assert.match(audit, /audit log/)
})

test('the announcement is the verdict and the reason in one breath', () => {
  assert.equal(t.announced(true, 'Because.'), 'Allow. Because.')
  assert.equal(t.announced(false, 'Because.'), 'Deny. Because.')
})

test('the plain reading of a fuzz uses only what it measured, and is honest if a leak ever got through', () => {
  assert.equal(
    t.plainFuzz({ crossTenant: 5061, evaluated: 10_000, leaks: 0 }),
    "5,061 of the 10,000 requests asked for another company's records. The rulebook refused every one of them.",
  )
  assert.match(t.plainFuzz({ crossTenant: 5061, evaluated: 10_000, leaks: 3 }), /3 of them got through/)
  assert.doesNotMatch(t.plainFuzz({ crossTenant: 5061, evaluated: 10_000, leaks: 3 }), /refused every one/)
  assert.match(t.plainFuzz({ crossTenant: 0, evaluated: 10_000, leaks: 0 }), /^None of the 10,000 requests/)
})

test('the plain reading of an unplugged run names the node, the batch, where it was rerun and how long it took', () => {
  const sentence = t.plainPlug({ node: 'policy-b', batch: 6, retryNode: 'policy-a', ms: 13, evaluated: 10_000 })
  assert.equal(
    sentence,
    'policy-b was unplugged while it held batch 6. The scheduler ran that batch again on policy-a and had its answer 13 ms after the failure, so the fuzz still counted all 10,000 requests.',
  )
  assert.match(t.plainPlug({ node: 'policy-b', batch: 2, retryNode: 'policy-b', ms: 0.4, evaluated: 10_000 }), /0\.4 ms after the failure/)
})

test('the run status is a real count while it runs', () => {
  assert.equal(t.running(4000, 10_000), 'Running: 4,000 of 10,000 evaluated so far…')
})

test('a ledger cell reads as one full sentence', () => {
  assert.equal(t.cell(5, 'done', 'policy-a', 1.6, true), 'Batch 5: done on policy-a, 1.6 ms, retried after a plug was pulled.')
  assert.equal(t.cell(9, 'queued', undefined, undefined, false), 'Batch 9: queued.')
})
