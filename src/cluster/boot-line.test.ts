import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildBootLine, BOOT_LINE_CLOSING } from './boot-line.ts'
import { formatBytes, formatMs, formatUptime } from './format.ts'
import type { TelemetrySnapshot } from './telemetry.ts'

const up = (spawnAt: number, readyAt: number) => ({ spawnAt, readyAt, spinUpMs: readyAt - spawnAt })

test('the spec example: three services up, vision on standby, one node, term 1', () => {
  const workers: TelemetrySnapshot['workers'] = {
    'retrieval-a': up(500, 530.2),
    'policy-a': up(500, 541),
    'policy-b': up(500, 543.6),
    'review-a': up(500, 561),
  }
  assert.equal(
    buildBootLine({ fcp: 412.4, workers, nodes: 1, term: 1 }),
    `FCP 412 ms · retrieval up 530 ms · policy up 544 ms · review up 561 ms · vision standby · 1 node · term 1 · ${BOOT_LINE_CLOSING}`,
  )
})

test('services are listed in the order they came up; a pool is up when its last node is ready', () => {
  const workers: TelemetrySnapshot['workers'] = {
    'review-a': up(100, 120),
    'policy-a': up(100, 110),
    'policy-b': up(100, 150),
    'retrieval-a': up(100, 130),
    'vision-a': up(100, 160),
  }
  assert.equal(
    buildBootLine({ fcp: 90, workers, nodes: 2, term: 3 }),
    `FCP 90 ms · review up 120 ms · retrieval up 130 ms · policy up 150 ms · vision up 160 ms · 2 nodes · term 3 · ${BOOT_LINE_CLOSING}`,
  )
})

test('while a worker is still starting there is no closing clause, and nothing is invented before measurements exist', () => {
  const workers: TelemetrySnapshot['workers'] = {
    'retrieval-a': up(100, 130),
    'policy-a': up(100, 120),
    'policy-b': { spawnAt: 100, readyAt: null, spinUpMs: null },
  }
  assert.equal(
    buildBootLine({ fcp: null, workers, nodes: 1, term: 0 }),
    'retrieval up 130 ms · policy starting · review standby · vision standby · 1 node',
  )
  assert.equal(buildBootLine({ fcp: null, workers: {}, nodes: 1, term: 0 }), 'retrieval standby · policy standby · review standby · vision standby · 1 node')
})

test('formatters', () => {
  assert.equal(formatUptime(42_000), '00:42')
  assert.equal(formatUptime(3_723_000), '1:02:03')
  assert.equal(formatUptime(-5), '00:00')
  assert.equal(formatBytes(14_239_897), '14.24 MB')
  assert.equal(formatBytes(36_524), '36.5 KB')
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatMs(412.4), '412 ms')
  assert.equal(formatMs(3.14), '3.1 ms')
})
