import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isLit, jobsInFlight, servicePhase } from './phase.ts'
import type { ClusterNodeState } from './scheduler.ts'

const node = (service: ClusterNodeState['service'], status: ClusterNodeState['status']): ClusterNodeState => ({
  service,
  status,
  spawnedAt: 0,
  jobs: 0,
  inFlight: status === 'busy' ? 1 : 0,
  respawns: 0,
})

test('a service nobody has spawned is on standby', () => {
  assert.equal(servicePhase({ nodes: {} }, 'vision'), 'standby')
  assert.equal(servicePhase({ nodes: { 'retrieval-a': node('retrieval', 'ready') } }, 'vision'), 'standby')
})

test('one-node services: starting, ready, busy, down', () => {
  assert.equal(servicePhase({ nodes: { 'review-a': node('review', 'spawning') } }, 'review'), 'starting')
  assert.equal(servicePhase({ nodes: { 'review-a': node('review', 'ready') } }, 'review'), 'ready')
  assert.equal(servicePhase({ nodes: { 'review-a': node('review', 'busy') } }, 'review'), 'busy')
  assert.equal(servicePhase({ nodes: { 'review-a': node('review', 'dead') } }, 'review'), 'down')
})

test('the two-node policy pool: starting until both are up, degraded when one is unplugged', () => {
  const pool = (a: ClusterNodeState['status'], b: ClusterNodeState['status']) => ({
    nodes: { 'policy-a': node('policy', a), 'policy-b': node('policy', b) },
  })
  assert.equal(servicePhase(pool('spawning', 'spawning'), 'policy'), 'starting')
  assert.equal(servicePhase(pool('ready', 'spawning'), 'policy'), 'degraded')
  assert.equal(servicePhase(pool('ready', 'ready'), 'policy'), 'ready')
  assert.equal(servicePhase(pool('busy', 'ready'), 'policy'), 'busy')
  assert.equal(servicePhase(pool('busy', 'dead'), 'policy'), 'degraded')
  assert.equal(servicePhase(pool('dead', 'dead'), 'policy'), 'down')
  assert.equal(servicePhase({ nodes: { 'policy-a': node('policy', 'ready') } }, 'policy'), 'degraded', 'only one of two nodes spawned so far')
})

test('lit means able to work; in-flight counts only running jobs of that service', () => {
  assert.deepEqual(
    (['standby', 'starting', 'ready', 'busy', 'degraded', 'down'] as const).map(isLit),
    [false, false, true, true, true, false],
  )
  const queue = [
    { id: 'j1', kind: 'policy.fuzz' as const, attempts: 1, node: 'policy-a' },
    { id: 'j2', kind: 'policy.fuzz' as const, attempts: 0 },
    { id: 'j3', kind: 'review.analyze' as const, attempts: 1, node: 'review-a' },
  ]
  assert.equal(jobsInFlight({ queue }, 'policy'), 1)
  assert.equal(jobsInFlight({ queue }, 'review'), 1)
  assert.equal(jobsInFlight({ queue }, 'vision'), 0)
})
