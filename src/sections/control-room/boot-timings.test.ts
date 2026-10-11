import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BOOT_LINE_CLOSING, buildBootLine } from '../../cluster/boot-line.ts'
import type { TelemetrySnapshot } from '../../cluster/telemetry.ts'
import { NO_FIRST_READY, bootTimings, rememberFirstReady } from './boot-timings.ts'

type Workers = TelemetrySnapshot['workers']

const up = (spawnAt: number, readyAt: number) => ({ spawnAt, readyAt, spinUpMs: Math.round((readyAt - spawnAt) * 10) / 10 })
const spawning = (spawnAt: number) => ({ spawnAt, readyAt: null, spinUpMs: null })

/** What telemetry holds after a normal boot. */
const booted: Workers = {
  'retrieval-a': up(500, 530.2),
  'policy-a': up(500, 541),
  'policy-b': up(500, 543.6),
  'review-a': up(500, 561),
}

const line = (workers: Workers) => buildBootLine({ fcp: 172.4, workers, nodes: 1, term: 1 })

test('every node that has come up is remembered with its first spawn and its first ready', () => {
  const known = rememberFirstReady(NO_FIRST_READY, booted)
  assert.deepEqual(Object.keys(known).sort(), ['policy-a', 'policy-b', 'retrieval-a', 'review-a'])
  assert.deepEqual(known['policy-b'], up(500, 543.6))
})

test('a node that is still starting, or was never spawned, is not remembered; nothing new returns the same object', () => {
  const partial: Workers = { 'retrieval-a': up(500, 530.2), 'policy-a': spawning(500), 'policy-b': { spawnAt: null, readyAt: null, spinUpMs: null } }
  const known = rememberFirstReady(NO_FIRST_READY, partial)
  assert.deepEqual(Object.keys(known), ['retrieval-a'])
  assert.equal(rememberFirstReady(known, partial), known, 'identity is kept when there is nothing new, so React does not loop')
  assert.equal(rememberFirstReady(NO_FIRST_READY, {}), NO_FIRST_READY)
  // The next snapshot brings policy-a up: only then is it added, and the earlier entry is untouched.
  const later = rememberFirstReady(known, { ...partial, 'policy-a': up(500, 541) })
  assert.deepEqual(Object.keys(later).sort(), ['policy-a', 'retrieval-a'])
  assert.equal(later['retrieval-a'], known['retrieval-a'])
})

test('a respawn after boot never rewrites the boot line: "policy up 544 ms" stays, not "policy up 36380 ms"', () => {
  const known = rememberFirstReady(NO_FIRST_READY, booted)
  const before = line(bootTimings(known, booted))
  assert.equal(
    before,
    `FCP 172 ms · retrieval up 530 ms · policy up 544 ms · review up 561 ms · vision standby · 1 node · term 1 · ${BOOT_LINE_CLOSING}`,
  )

  // "Pull the plug on policy-b": the scheduler spawns the same node again, and telemetry overwrites its timing ...
  const respawning: Workers = { ...booted, 'policy-b': spawning(36_372) }
  assert.equal(rememberFirstReady(known, respawning), known, 'a respawn is not a first ready')
  assert.equal(line(bootTimings(known, respawning)), before, 'while it respawns, the boot line does not change (no "policy starting")')

  // ... and again when the respawned worker says ready.
  const respawned: Workers = { ...booted, 'policy-b': up(36_372, 36_380) }
  assert.equal(rememberFirstReady(known, respawned), known)
  assert.equal(line(bootTimings(known, respawned)), before)
  // Without the freeze, this is the line the review found.
  assert.match(line(respawned), /policy up 36380 ms/)
})

test('a service that boots later (vision, started on demand) is added when it first comes up, and is frozen from then on', () => {
  let known = rememberFirstReady(NO_FIRST_READY, booted)
  const starting: Workers = { ...booted, 'vision-a': spawning(9_000) }
  assert.equal(rememberFirstReady(known, starting), known)
  assert.match(line(bootTimings(known, starting)), /vision starting/)
  assert.ok(!line(bootTimings(known, starting)).includes(BOOT_LINE_CLOSING), 'no closing clause while a service is starting')

  const visionUp: Workers = { ...booted, 'vision-a': up(9_000, 9_212) }
  known = rememberFirstReady(known, visionUp)
  assert.match(line(bootTimings(known, visionUp)), /vision up 9212 ms/)
  // Respawning vision later does not move its figure either.
  const again: Workers = { ...visionUp, 'vision-a': up(70_000, 70_300) }
  assert.equal(rememberFirstReady(known, again), known)
  assert.match(line(bootTimings(known, again)), /vision up 9212 ms/)
})

test('with nothing remembered the live timings pass through untouched', () => {
  assert.equal(bootTimings(NO_FIRST_READY, booted), booted)
})
