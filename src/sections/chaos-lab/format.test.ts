import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copy } from '../../data/copy.ts'
import { backAfterPull, logStamp, plugReceipts, plugReward, retriedOnRespawn, rewardMs, splitNodeIds, toneFor, workerSpunUp } from './format.ts'
import type { PlugRun } from './plug.ts'

const run = (patch: Partial<PlugRun> = {}): PlugRun => ({
  mode: 'plug',
  phase: 'done',
  startedAt: 0,
  jobs: [],
  batches: [],
  killed: { node: 'policy-b', batch: 3, at: 40, inFlightMs: 8.4 },
  recovery: { jobId: 'j3', batch: 3, node: 'policy-a', retry: 1, ms: 38.2 },
  respawnMs: 44.6,
  totals: { evaluated: 200_000, leaks: 0 },
  spans: [],
  error: null,
  ...patch,
})

test('milliseconds read with a decimal under ten and whole above', () => {
  assert.equal(rewardMs(7.94), 7.9)
  assert.equal(rewardMs(9.99), 10)
  assert.equal(rewardMs(10.4), 10)
  assert.equal(rewardMs(110.6), 111)
})

test('the log stamp is minutes, seconds and tenths since the page loaded', () => {
  assert.equal(logStamp(0), '00:00.0')
  assert.equal(logStamp(12_450), '00:12.4')
  assert.equal(logStamp(61_000 + 900), '01:01.9')
  assert.equal(logStamp(-5), '00:00.0')
})

test('scheduler sentences get a tone: recovery cobalt, trouble vermilion, the rest ink', () => {
  assert.equal(toneFor('retry 1 · batch 3 → policy-a · recovered in 38 ms'), 'cobalt')
  assert.equal(toneFor('policy-b unplugged · batch 3 in flight'), 'live')
  assert.equal(toneFor('policy-b did not start (timeout)'), 'live')
  assert.equal(toneFor('policy-b is up in 38 ms'), 'ink')
})

test('the plug reward is the spec sentence with the run\'s own numbers, and only for a run that proved failover', () => {
  assert.equal(
    plugReward(run()),
    copy.chaos.experiments.plug.reward({ sibling: 'policy-a', retry: 1, ms: 38 }),
    'retried on the sibling: its name goes where the spec says {sibling}',
  )
  assert.equal(plugReward(run({ phase: 'running' })), null)
  assert.equal(plugReward(run({ phase: 'error', error: 'x' })), null)
  assert.equal(plugReward(run({ recovery: null })), null, 'nothing was retried, so nothing was proved')
  assert.equal(plugReward(run({ mode: 'fuzz' })), null, 'a plain fuzz proves nothing about failover')
})

test('when the retry landed on the respawned node itself, the sentence says so instead of naming the killed worker bare', () => {
  const reborn = run({ recovery: { jobId: 'j3', batch: 3, node: 'policy-b', retry: 1, ms: 107.4 } })
  assert.equal(retriedOnRespawn(reborn), true)
  assert.equal(retriedOnRespawn(run()), false)
  const sentence = plugReward(reborn)
  assert.ok(sentence)
  assert.match(sentence, /retried the job on policy-b \(the respawned worker\) — retry 1, recovered in 107 ms\./)
  assert.ok(sentence.startsWith('You just killed a worker.') && sentence.endsWith('That is failover, on a static page.'))
})

test('the two respawn timings each name where they start, so one unplug never shows two unlabelled answers', () => {
  const spunUp = workerSpunUp('policy-b', 8)
  const back = backAfterPull('policy-b', 11)
  assert.equal(spunUp, 'policy-b respawned · worker spun up in 8 ms')
  assert.equal(back, 'policy-b back 11 ms after the pull')
  // Neither sentence is the other's wording, and neither reads as a bare "in N ms" for the same event.
  assert.doesNotMatch(spunUp, /back|pull/)
  assert.doesNotMatch(back, /spun up|respawned/)
  assert.doesNotMatch(`${spunUp} ${back}`, /respawned in|back in/)
})

test('the receipts carry only what the sentence does not: the cut, the respawn, the totals', () => {
  assert.equal(plugReceipts(run()), 'unplugged policy-b during batch 3, 8.4 ms after it was dispatched · policy-b back 45 ms after the pull · 200,000 evaluations, 0 cross-tenant leaks')
  assert.equal(plugReceipts(run({ respawnMs: null, totals: null, killed: { node: 'policy-b', batch: null, at: 1, inFlightMs: null } })), 'unplugged policy-b')
  assert.equal(plugReceipts(run({ killed: null, recovery: null, respawnMs: null, totals: null })), '')
})

test('node ids are split out of a sentence so they can be set whole in mono', () => {
  assert.deepEqual(splitNodeIds('The leader is tab-4a8c, term 2.'), [
    { text: 'The leader is ', node: false },
    { text: 'tab-4a8c', node: true },
    { text: ', term 2.', node: false },
  ])
  assert.deepEqual(
    splitNodeIds('retried on policy-b (the respawned worker); policy-a took batch 4').filter((s) => s.node).map((s) => s.text),
    ['policy-b', 'policy-a'],
  )
  assert.deepEqual(splitNodeIds('no ids here'), [{ text: 'no ids here', node: false }])
  assert.deepEqual(splitNodeIds(''), [])
  assert.equal(splitNodeIds('policy-z and tab-zz are not ids').some((s) => s.node), false, 'only real node ids: the pool letters a to h, and hex tab ids')
  assert.equal(splitNodeIds('tab-4a8c policy-b').map((s) => s.text).join(''), 'tab-4a8c policy-b', 'nothing is lost or reordered')
})
