import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ClusterState } from '../../cluster/scheduler.ts'
import { anyJobRunning, darkHalf, hotKey, parseDuration, parseHotKey, parsePipKey, pipKey, pipStates, sentenceCase, splitHint, throwFor } from './board-state.ts'

type Nodes = ClusterState['nodes']
type Queue = ClusterState['queue']

const node = (service: 'retrieval' | 'vision' | 'policy' | 'review', status: 'spawning' | 'ready' | 'busy' | 'dead'): Nodes[string] => ({
  service,
  status,
  spawnedAt: 0,
  jobs: 0,
  inFlight: status === 'busy' ? 1 : 0,
  respawns: 0,
})

test('a service nobody spawned has all its pips off; policy has two pips, the rest one', () => {
  assert.deepEqual(pipStates({}, 'policy'), ['off', 'off'])
  assert.deepEqual(pipStates({}, 'retrieval'), ['off'])
  assert.deepEqual(pipStates({}, 'vision'), ['off'])
  assert.deepEqual(pipStates({}, 'review'), ['off'])
})

test('pips follow the scheduler: ready and busy are lit, spawning waits, dead is off', () => {
  const nodes: Nodes = { 'policy-a': node('policy', 'busy'), 'policy-b': node('policy', 'spawning') }
  assert.deepEqual(pipStates(nodes, 'policy'), ['on', 'wait'])
  nodes['policy-b'] = node('policy', 'dead')
  assert.deepEqual(pipStates(nodes, 'policy'), ['on', 'off'])
  nodes['policy-b'] = node('policy', 'ready')
  assert.deepEqual(pipStates(nodes, 'policy'), ['on', 'on'])
})

test('the pip key is a primitive that round-trips (so a store selector re-renders only on change)', () => {
  const nodes: Nodes = { 'policy-a': node('policy', 'ready'), 'policy-b': node('policy', 'dead') }
  assert.equal(pipKey(nodes, 'policy'), 'on,off')
  assert.deepEqual(parsePipKey('on,off'), ['on', 'off'])
  assert.deepEqual(parsePipKey(''), [])
})

test('one dark half only when exactly one of two workers is down and the other still serves', () => {
  assert.equal(darkHalf(['on', 'off']), 'r')
  assert.equal(darkHalf(['off', 'on']), 'l')
  assert.equal(darkHalf(['on', 'wait']), 'r')
  assert.equal(darkHalf(['on', 'on']), null)
  assert.equal(darkHalf(['off', 'off']), null)
  assert.equal(darkHalf(['wait', 'wait']), null)
  assert.equal(darkHalf(['on']), null)
  assert.equal(darkHalf([]), null)
})

test('a cable is hot while a job of its service runs on a worker; a queued job does not heat anything', () => {
  const queued: Queue = [{ id: 'j1', kind: 'policy.fuzz', attempts: 0 }]
  assert.equal(hotKey(queued), '')
  const running: Queue = [
    { id: 'j1', kind: 'policy.fuzz', attempts: 1, node: 'policy-a' },
    { id: 'j2', kind: 'policy.fuzz', attempts: 1, node: 'policy-b' },
    { id: 'j3', kind: 'retrieval.search', attempts: 1, node: 'retrieval-a' },
    { id: 'j4', kind: 'review.analyze', attempts: 0 },
  ]
  assert.equal(hotKey(running), 'policy,retrieval')
  assert.deepEqual([...parseHotKey('policy,retrieval')].sort(), ['policy', 'retrieval'])
  assert.deepEqual([...parseHotKey('')], [])
})

test('a phone motion sample heats the SENSORS cable as well as the vision cable', () => {
  const motion: Queue = [{ id: 'm1', kind: 'vision.motion', attempts: 1, node: 'vision-a' }]
  assert.equal(hotKey(motion), 'sensors,vision')
  const detect: Queue = [{ id: 'd1', kind: 'vision.detect', attempts: 1, node: 'vision-a' }]
  assert.equal(hotKey(detect), 'vision')
})

test('the relay coil lamp is lit exactly while some job runs on some worker', () => {
  assert.equal(anyJobRunning([]), false)
  assert.equal(anyJobRunning([{ id: 'j', kind: 'policy.fuzz', attempts: 0 }]), false)
  assert.equal(anyJobRunning([{ id: 'j', kind: 'policy.fuzz', attempts: 1, node: 'policy-a' }]), true)
})

test('the throw: sending swings one way and pulses relay to lamp, answering swings back and pulses lamp to relay', () => {
  assert.deepEqual(throwFor('out', 'policy', 'policy.fuzz'), { direction: 'out', pulses: [{ lamp: 'policy', direction: 'out' }] })
  assert.deepEqual(throwFor('in', 'review'), { direction: 'in', pulses: [{ lamp: 'review', direction: 'in' }] })
  // A phone sample travels sensor -> relay first, then the relay hands it to the vision worker.
  assert.deepEqual(throwFor('out', 'vision', 'vision.motion'), {
    direction: 'out',
    pulses: [
      { lamp: 'sensors', direction: 'in' },
      { lamp: 'vision', direction: 'out' },
    ],
  })
})

test('"or press 2" splits into the words and the key', () => {
  assert.deepEqual(splitHint('or press 2'), { text: 'or press', key: '2' })
  assert.deepEqual(splitHint('press'), { text: '', key: 'press' })
  assert.deepEqual(splitHint(''), { text: '', key: '' })
})

test('SENSORS is read as a word, not letter by letter', () => {
  assert.equal(sentenceCase('SENSORS'), 'Sensors')
  assert.equal(sentenceCase('retrieval'), 'Retrieval')
  assert.equal(sentenceCase(''), '')
})

test('the motion tokens are read from CSS as milliseconds, with a fallback for anything else', () => {
  assert.equal(parseDuration('120ms', 99), 120)
  assert.equal(parseDuration(' 0.4s ', 99), 400)
  assert.equal(parseDuration('0ms', 99), 0)
  assert.equal(parseDuration('', 99), 99)
  assert.equal(parseDuration('fast', 99), 99)
  assert.equal(parseDuration('12', 99), 99)
})
