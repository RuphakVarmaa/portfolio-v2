import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { QuorumMember, QuorumState } from '../../cluster/quorum.ts'
import type { ClusterNodeState, ClusterState } from '../../cluster/scheduler.ts'
import { copy } from '../../data/copy.ts'
import { MAX_LOG_LINES, createChaosStore } from './chaos-store.ts'
import type { OperatorStep } from './operator.ts'
import type { PlugRun } from './plug.ts'

const SELF = 'tab-self'

function member(id: string, isLeader: boolean, isSelf = false): QuorumMember {
  return { id, isSelf, isLeader, lastSeen: isSelf ? null : 0 }
}

function quorumState(leaderId: string | null, term: number, others: string[] = []): QuorumState {
  const members = [member(SELF, leaderId === SELF, true), ...others.map((id) => member(id, leaderId === id))]
  return {
    supported: true,
    nodeId: SELF,
    term,
    leaderId,
    isLeader: leaderId === SELF,
    peers: members.filter((m) => !m.isSelf).map((m) => ({ id: m.id, lastSeen: 0, isLeader: m.isLeader })),
    nodes: members.length,
    members,
    newcomer: false,
  }
}

const node = (status: ClusterNodeState['status'], spawnedAt = 0, readyAt?: number): ClusterNodeState => ({
  service: 'policy',
  status,
  spawnedAt,
  ...(readyAt === undefined ? {} : { readyAt }),
  jobs: 0,
  inFlight: 0,
  respawns: 0,
})

function rig(initialQuorum: QuorumState = quorumState(SELF, 1)) {
  let t = 1000
  let cluster: ClusterState = { nodes: {}, queue: [], spans: [] }
  let quorum = initialQuorum
  const schedulerListeners = new Set<() => void>()
  const quorumListeners = new Set<() => void>()
  const completed: OperatorStep[] = []
  const announced: string[] = []
  const store = createChaosStore({
    scheduler: {
      getState: () => cluster,
      subscribe: (l) => {
        schedulerListeners.add(l)
        return () => void schedulerListeners.delete(l)
      },
    },
    quorum: {
      getState: () => quorum,
      subscribe: (l) => {
        quorumListeners.add(l)
        return () => void quorumListeners.delete(l)
      },
    },
    now: () => t,
    operator: { complete: (step) => (completed.push(step), false) },
    announce: (text) => void announced.push(text),
  })
  return {
    store,
    completed,
    announced,
    schedulerListeners,
    quorumListeners,
    advance: (ms: number) => void (t += ms),
    setQuorum(next: QuorumState) {
      quorum = next
      for (const l of [...quorumListeners]) l()
    },
    setCluster(next: ClusterState) {
      cluster = next
      for (const l of [...schedulerListeners]) l()
    },
    cluster: () => cluster,
    texts: () => store.getSnapshot().log.map((line) => line.text),
  }
}

test('nothing is observed until start(), and the claims are reference-counted', () => {
  const r = rig()
  assert.equal(r.schedulerListeners.size + r.quorumListeners.size, 0)
  const a = r.store.start()
  const b = r.store.start()
  assert.equal(r.schedulerListeners.size, 1)
  assert.equal(r.quorumListeners.size, 1)
  a()
  a() // releasing twice does not release the other claim
  assert.equal(r.schedulerListeners.size, 1)
  b()
  assert.equal(r.schedulerListeners.size + r.quorumListeners.size, 0)
})

test('a lone tab logs its start and has proved nothing yet', () => {
  const r = rig()
  r.store.start()
  assert.deepEqual(r.texts(), ['tab-self (this tab) started · leader · term 1'])
  assert.equal(r.store.getSnapshot().tab, null)
  assert.deepEqual(r.completed, [])
})

test('experiment 2: a second tab joining latches the reward values and completes the step; the hero says the arrival, so the lab does not', () => {
  const r = rig()
  r.store.start()
  r.advance(100)
  r.store.noteTabClick()
  r.advance(640)
  r.setQuorum(quorumState(SELF, 1, ['tab-b']))
  const snap = r.store.getSnapshot()
  assert.deepEqual(snap.tab, { leaderId: SELF, term: 1, nodes: 2, seenAfterMs: 640 })
  assert.deepEqual(r.completed, ['tab'])
  assert.deepEqual(r.announced, [], 'the arrival is announced once, by the hero (a second voice for it was read twice or dropped)')
  assert.ok(r.texts().includes('tab-b joined'))
  r.setQuorum(quorumState(SELF, 1, ['tab-b', 'tab-c']))
  assert.deepEqual(r.completed, ['tab'], 'a third tab does not complete it again')
  assert.deepEqual(r.announced, [])
})

test('the newcomer tab records the step silently (it would only be announcing the news to itself)', () => {
  const r = rig(quorumState('tab-a', 1, ['tab-a']))
  r.store.start()
  assert.deepEqual(r.store.getSnapshot().tab, { leaderId: 'tab-a', term: 1, nodes: 2, seenAfterMs: null })
  assert.deepEqual(r.completed, ['tab'])
  assert.deepEqual(r.announced, [])
})

test('experiment 3: the surviving tab sees the leader lost and replaced and latches it; the cluster announces the new leader, the lab does not repeat it', () => {
  const r = rig(quorumState('tab-a', 1, ['tab-a']))
  r.store.start()
  r.completed.length = 0
  r.announced.length = 0
  r.advance(50)
  // BYE arrives first: the leader is gone, nobody leads yet.
  r.setQuorum(quorumState(null, 1))
  assert.equal(r.store.getSnapshot().leader, null)
  assert.deepEqual(r.store.getSnapshot().departed, [{ id: 'tab-a', wasLeader: true }])
  r.advance(2)
  // Then the Web Lock is handed over.
  r.setQuorum(quorumState(SELF, 2))
  const snap = r.store.getSnapshot()
  assert.deepEqual(snap.leader, { nodeId: SELF, term: 2, lostId: 'tab-a', ms: 2, self: true })
  assert.deepEqual(r.completed, ['leader'])
  assert.deepEqual(r.announced, [], 'boot.ts says "This tab is now the leader, term 2."; the third-person reward would be a second, clumsier voice')
  const texts = r.texts()
  assert.ok(texts.includes('tab-a left (it was the leader)'))
  assert.ok(texts.includes('leader lost: tab-a went away'))
  assert.ok(texts.includes('tab-self took the lock · term 2 (this tab)'))
})

test('experiment 3 with the lock handed over BEFORE the goodbye arrives: the dark lamp still remembers it led', () => {
  const r = rig(quorumState('tab-a', 1, ['tab-a']))
  r.store.start()
  // The lock moves first: this tab leads at term 2 while tab-a is still in the member list.
  r.setQuorum({ ...quorumState(SELF, 2, ['tab-a']), peers: quorumState(SELF, 2, ['tab-a']).peers })
  assert.equal(r.store.getSnapshot().leader?.lostId, 'tab-a')
  // Then the BYE: tab-a is dropped. At that moment it was no longer marked leader in the member list.
  r.setQuorum(quorumState(SELF, 2))
  assert.deepEqual(r.store.getSnapshot().departed, [{ id: 'tab-a', wasLeader: true }])
  assert.ok(r.texts().includes('tab-a left (it was the leader)'))
})

test('a follower leaving is not a failover', () => {
  const r = rig(quorumState(SELF, 1, ['tab-b']))
  r.store.start()
  r.completed.length = 0
  r.setQuorum(quorumState(SELF, 1))
  assert.equal(r.store.getSnapshot().leader, null)
  assert.deepEqual(r.completed, [])
  assert.deepEqual(r.store.getSnapshot().departed, [{ id: 'tab-b', wasLeader: false }])
  // And it comes back from the back-forward cache: the dark lamp goes away.
  r.setQuorum(quorumState(SELF, 1, ['tab-b']))
  assert.deepEqual(r.store.getSnapshot().departed, [])
})

test('the scheduler\'s own sentences and worker start-ups go on the log with the right tone', () => {
  const r = rig()
  r.store.start()
  r.setCluster({ nodes: { 'policy-b': node('spawning', 10) }, queue: [], spans: [] })
  r.setCluster({ nodes: { 'policy-b': node('ready', 10, 48) }, queue: [], spans: [] })
  r.setCluster({ nodes: { 'policy-b': node('dead', 10, undefined) }, queue: [], spans: [], lastEvent: 'policy-b unplugged · batch 4 in flight' })
  // The survivor finishes the retried batch while policy-b is still coming back, then policy-b is ready.
  r.setCluster({
    nodes: { 'policy-b': node('dead', 10) },
    queue: [],
    spans: [],
    lastEvent: 'retry 1 · batch 4 → policy-a · recovered in 8 ms',
  })
  r.setCluster({
    nodes: { 'policy-b': node('ready', 90, 131) },
    queue: [],
    spans: [],
    lastEvent: 'retry 1 · batch 4 → policy-a · recovered in 8 ms',
  })
  const lines = r.store.getSnapshot().log.slice(1) // after the start line
  assert.deepEqual(
    lines.map((l) => [l.text, l.tone]),
    [
      ['policy-b is up in 38 ms', 'muted'],
      ['policy-b unplugged · batch 4 in flight', 'live'],
      ['retry 1 · batch 4 → policy-a · recovered in 8 ms', 'cobalt'],
      ['policy-b respawned · worker spun up in 41 ms', 'muted'],
    ],
  )
})

test('experiment 1 is completed once, by a finished run that really recovered', () => {
  const r = rig()
  r.store.start()
  const base: PlugRun = {
    mode: 'plug',
    phase: 'running',
    startedAt: 5,
    jobs: [],
    batches: [],
    killed: { node: 'policy-b', batch: 4, at: 20, inFlightMs: null },
    recovery: null,
    respawnMs: null,
    totals: null,
    spans: [],
    error: null,
  }
  r.store.setPlug(base)
  r.store.setPlug({ ...base, phase: 'error', error: 'nope' })
  assert.deepEqual(r.completed, [], 'running and failed runs prove nothing')
  const done: PlugRun = { ...base, phase: 'done', recovery: { jobId: 'j4', batch: 4, node: 'policy-a', retry: 1, ms: 7.9 }, respawnMs: 41 }
  r.store.setPlug(done)
  r.store.setPlug({ ...done })
  assert.deepEqual(r.completed, ['plug'])
  assert.deepEqual(r.announced, [copy.chaos.experiments.plug.reward({ sibling: 'policy-a', retry: 1, ms: 7.9 })])
  assert.equal(r.store.getSnapshot().plug?.phase, 'done')
  r.store.setPlug({ ...done, mode: 'fuzz', startedAt: 99, recovery: null })
  assert.deepEqual(r.completed, ['plug'], 'a plain fuzz does not count')
})

test('experiment 1 announces the respawned worker by name when the retry landed on it', () => {
  const r = rig()
  r.store.start()
  r.store.setPlug({
    mode: 'plug',
    phase: 'done',
    startedAt: 7,
    jobs: [],
    batches: [],
    killed: { node: 'policy-b', batch: 3, at: 20, inFlightMs: 8 },
    recovery: { jobId: 'j3', batch: 3, node: 'policy-b', retry: 1, ms: 107.4 },
    respawnMs: 45,
    totals: null,
    spans: [],
    error: null,
  })
  assert.equal(r.announced.length, 1)
  assert.match(r.announced[0], /retried the job on policy-b \(the respawned worker\) — retry 1, recovered in 107 ms\./)
  assert.deepEqual(r.completed, ['plug'])
})

test('the log keeps only the newest lines', () => {
  const r = rig()
  for (let i = 0; i < MAX_LOG_LINES + 30; i++) r.store.log(`line ${i}`)
  const log = r.store.getSnapshot().log
  assert.equal(log.length, MAX_LOG_LINES)
  assert.equal(log.at(-1)?.text, `line ${MAX_LOG_LINES + 29}`)
  assert.equal(log[0].text, `line 30`)
})
