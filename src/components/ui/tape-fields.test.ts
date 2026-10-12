import assert from 'node:assert/strict'
import { test } from 'node:test'
import { auditLine, decide, rowNumberFor } from '../../lib/policy/engine.ts'
import { ACTIONS, DATA_TENANT, RESOURCES, ROLES, TENANTS } from '../../lib/policy/rulebook.ts'
import { compactLine, splitUnbroken, tapeFields } from './tape-fields.ts'

const AT = Date.UTC(2026, 9, 11, 12, 0, 0)

test('an audit line is cut into key=value fields, with the verdict and the policy together after the arrow', () => {
  const line = '2026-10-11T12:00:00.000Z tenant=B actor=u_3fa9(role=owner) action=write resource=project:A-417 → DENY policy=rls.tenant'
  assert.deepEqual(tapeFields(line), [
    '2026-10-11T12:00:00.000Z',
    'tenant=B',
    'actor=u_3fa9(role=owner)',
    'action=write',
    'resource=project:A-417',
    '→ DENY policy=rls.tenant',
  ])
})

test('every audit line the engine can write is an audit line to the tape, and nothing is added or dropped', () => {
  let checked = 0
  for (const actorTenant of TENANTS) {
    for (const role of ROLES) {
      for (const resource of RESOURCES) {
        for (const action of ACTIONS) {
          const request = { tenant: actorTenant, actorTenant, role, resource, action, resourceTenant: DATA_TENANT }
          const line = auditLine(request, decide(request), AT, rowNumberFor(resource))
          const fields = tapeFields(line)
          assert.equal(fields.length, 6, line)
          assert.ok(fields[2].startsWith('actor=u_') && fields[2].endsWith(')'), fields[2])
          assert.match(fields[5], /^→ (ALLOW|DENY) policy=\S+$/, fields[5])
          assert.equal(fields.join(' '), line)
          checked += 1
        }
      }
    }
  }
  assert.equal(checked, 3 * 4 * 4 * 4)
})

test('an event line is cut at its middots, each part keeping its own trailing middot', () => {
  const batch = 'batch 7 · policy-a · 1,000 evaluated · 505 across tenants · 0 leaks · 1.1 ms'
  assert.deepEqual(tapeFields(batch), ['batch 7 ·', 'policy-a ·', '1,000 evaluated ·', '505 across tenants ·', '0 leaks ·', '1.1 ms'])
  const recovery = 'retry 1 · batch 6 → policy-a · recovered in 58 ms'
  assert.deepEqual(tapeFields(recovery), ['retry 1 ·', 'batch 6 → policy-a ·', 'recovered in 58 ms'])
  const result = '0 cross-tenant leaks · 10,000 evaluations · 41,964 evals/s · p95 8.8 ms · verified in your browser just now'
  assert.equal(tapeFields(result).length, 5)
  assert.equal(tapeFields(result).at(-1), 'verified in your browser just now')
})

test('a sentence with no middots is one field', () => {
  const sentence = 'The run finished before policy-b was holding a batch, so no plug was pulled.'
  assert.deepEqual(tapeFields(sentence), [sentence])
  assert.deepEqual(tapeFields(''), [''])
})

test('joined with a space the fields are always the original text (so copying the tape copies the real line)', () => {
  const samples = [
    'fuzz run 1 · seed 1 · 10 batches of 1,000 requests',
    'policy-b unplugged · batch 6, batch 7 in flight',
    'batch 3 failed: terminated',
    'policy workers are not available: no Worker',
    'The fuzz could not be loaded.',
    ' · ',
    'a · · b',
    '2026-10-11T12:00:00.000Z tenant=A actor=u_0001(role=viewer) action=read resource=task:A-100 → ALLOW policy=task.read',
    '2026-10-11T12:00:00.000Z tenant=A not-an-audit-line · really',
  ]
  for (const text of samples) assert.equal(tapeFields(text).join(' '), text, text)
})

test('only a hyphen or slash between two letters is kept in one piece', () => {
  assert.deepEqual(splitUnbroken('Decided in 0.8 µs on policy-a (mean of 2,000 runs).'), ['Decided in 0.8 µs on ', 'policy-a', ' (mean of 2,000 runs).'])
  assert.deepEqual(splitUnbroken('41,964 evals/s · p95 8.8 ms'), ['41,964 ', 'evals/s', ' · p95 8.8 ms'])
  assert.deepEqual(splitUnbroken('resource=audit-log:A-225'), ['', 'resource=audit-log:A-225', ''])
  // Not break opportunities in the first place: a hyphen before a digit, the date, a plain word.
  assert.deepEqual(splitUnbroken('project:A-417 2026-10-11T12:00:00.000Z tenant=B'), ['project:A-417 2026-10-11T12:00:00.000Z tenant=B'])
  // Whatever the split, the pieces are the text again.
  for (const text of ['policy-b was unplugged while it held batch 6.', '0 cross-tenant leaks', 'a/b-c d']) {
    assert.equal(splitUnbroken(text).join(''), text)
  }
})

// ---- a phone's tape: the answer first (review round 2) --------------------------------------------------

test('an audit line prints verdict and policy first on a narrow tape, with the time of day and no date', () => {
  const line = '2026-10-11T23:19:38.707Z tenant=B actor=u_3fa9(role=owner) action=write resource=project:A-417 → DENY policy=rls.tenant'
  assert.equal(compactLine(line), 'DENY policy=rls.tenant 23:19:38.7 tenant=B actor=u_3fa9(role=owner) action=write resource=project:A-417')
  const allow = '2026-10-11T08:05:00.000Z tenant=A actor=u_77ab(role=member) action=read resource=task:A-102 → ALLOW policy=task.read'
  assert.equal(compactLine(allow), 'ALLOW policy=task.read 08:05:00.0 tenant=A actor=u_77ab(role=member) action=read resource=task:A-102')
})

test('every audit line the engine can write has a narrow form that starts with its verdict and keeps every field', () => {
  let checked = 0
  for (const actorTenant of TENANTS) {
    for (const role of ROLES) {
      for (const resource of RESOURCES) {
        for (const action of ACTIONS) {
          const request = { tenant: actorTenant, actorTenant, role, resource, action, resourceTenant: DATA_TENANT }
          const decision = decide(request)
          const line = auditLine(request, decision, AT, rowNumberFor(resource))
          const narrow = compactLine(line)
          assert.ok(narrow !== null, line)
          assert.ok(narrow.startsWith(`${decision.allow ? 'ALLOW' : 'DENY'} policy=${decision.policy} `), narrow)
          // The fields are the wide line's, in the wide line's order, after the answer and the time.
          const [, , , ...fields] = narrow.split(' ')
          assert.deepEqual(fields, tapeFields(line).slice(1, 5), line)
          checked += 1
        }
      }
    }
  }
  assert.equal(checked, 3 * 4 * 4 * 4)
})

test('an operator-log line prints what happened first and the clock last', () => {
  assert.equal(compactLine('00:18.3  retry 1 · batch 7 → policy-a · recovered in 15 ms'), 'retry 1 · batch 7 → policy-a · recovered in 15 ms · 00:18.3')
  assert.equal(compactLine('00:00.2  tab-3b9a (this tab) started · leader · term 1'), 'tab-3b9a (this tab) started · leader · term 1 · 00:00.2')
})

test('any other line has no second form', () => {
  for (const line of ['batch 7 · policy-a · 1,000 evaluated · 505 across tenants · 0 leaks · 1.1 ms', 'no entries yet', '', '00:18.3 one space only', '2026-10-11T23:19:38.707Z tenant=B']) {
    assert.equal(compactLine(line), null, line)
  }
})
