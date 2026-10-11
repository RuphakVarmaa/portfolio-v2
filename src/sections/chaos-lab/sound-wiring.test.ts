import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { QuorumState } from '../../cluster/quorum.ts'
import type { ClusterState } from '../../cluster/scheduler.ts'
import { attachSoundWiring, type SoundDeps } from './sound-wiring.ts'

function setup() {
  const calls: string[] = []
  let audioState = { enabled: false, unlocked: false }
  const audioListeners = new Set<() => void>()
  const messageListeners = new Set<() => void>()
  const schedulerListeners = new Set<() => void>()
  const quorumListeners = new Set<() => void>()
  const visibilityListeners = new Set<() => void>()
  let visible = true
  let cluster: ClusterState = { nodes: {}, queue: [], spans: [] }
  let quorum = { nodeId: 'tab-self', term: 1, leaderId: 'tab-self' as string | null, isLeader: true } as QuorumState
  let t = 0

  const deps: SoundDeps = {
    audio: {
      click: () => void calls.push('click'),
      humStart: () => void calls.push('humStart'),
      humStop: () => void calls.push('humStop'),
      failover: () => void calls.push('failover'),
      getState: () => audioState,
      subscribe: (l) => {
        audioListeners.add(l)
        return () => void audioListeners.delete(l)
      },
    },
    scheduler: {
      onMessage: (l) => {
        messageListeners.add(l as () => void)
        return () => void messageListeners.delete(l as () => void)
      },
      subscribe: (l) => {
        schedulerListeners.add(l)
        return () => void schedulerListeners.delete(l)
      },
      getState: () => cluster,
    },
    quorum: {
      subscribe: (l) => {
        quorumListeners.add(l)
        return () => void quorumListeners.delete(l)
      },
      getState: () => quorum,
    },
    visibility: {
      isVisible: () => visible,
      subscribe: (l) => {
        visibilityListeners.add(l)
        return () => void visibilityListeners.delete(l)
      },
    },
    now: () => t,
  }
  return {
    calls,
    deps,
    listenerCounts: () => messageListeners.size + schedulerListeners.size + quorumListeners.size + visibilityListeners.size + audioListeners.size,
    setAudio(next: { enabled: boolean; unlocked: boolean }) {
      audioState = next
      for (const l of [...audioListeners]) l()
    },
    message: () => {
      for (const l of [...messageListeners]) l()
    },
    setCluster(next: ClusterState) {
      cluster = next
      for (const l of [...schedulerListeners]) l()
    },
    setQuorum(next: Partial<QuorumState>) {
      quorum = { ...quorum, ...next } as QuorumState
      for (const l of [...quorumListeners]) l()
    },
    setVisible(next: boolean) {
      visible = next
      for (const l of [...visibilityListeners]) l()
    },
    advance: (ms: number) => {
      t += ms
    },
  }
}

test('nothing is attached, and nothing sounds, while sound is off', () => {
  const s = setup()
  const detach = attachSoundWiring(s.deps)
  assert.equal(s.listenerCounts(), 1, 'only the audio state follower')
  s.message()
  s.setQuorum({ term: 2 })
  assert.deepEqual(s.calls, [])
  detach()
  assert.equal(s.listenerCounts(), 0)
})

test('with sound on: a click per message, none while the tab is hidden', () => {
  const s = setup()
  attachSoundWiring(s.deps)
  s.setAudio({ enabled: true, unlocked: true })
  s.calls.length = 0
  s.message()
  s.message()
  assert.deepEqual(s.calls, ['click', 'click'])
  s.setVisible(false)
  s.calls.length = 0
  s.message()
  assert.deepEqual(s.calls, [], 'a background tab is silent')
})

test('the hum follows leadership and the tab being visible, and starts when the context unlocks', () => {
  const s = setup()
  attachSoundWiring(s.deps)
  s.setAudio({ enabled: true, unlocked: false })
  assert.ok(!s.calls.includes('humStart'), 'a locked context cannot hum yet')
  s.setAudio({ enabled: true, unlocked: true })
  assert.ok(s.calls.includes('humStart'))
  s.calls.length = 0
  s.setQuorum({ isLeader: false, leaderId: 'tab-other' })
  assert.deepEqual(s.calls, ['humStop'], 'no longer the leader: the hum stops')
  s.calls.length = 0
  s.setQuorum({ isLeader: true, leaderId: 'tab-self', term: 2 })
  assert.ok(s.calls.includes('humStart'))
  s.calls.length = 0
  s.setVisible(false)
  assert.deepEqual(s.calls, ['humStop'])
  s.setVisible(true)
  assert.ok(s.calls.includes('humStart'))
})

test('turning sound off detaches everything and stops the hum', () => {
  const s = setup()
  attachSoundWiring(s.deps)
  s.setAudio({ enabled: true, unlocked: true })
  assert.ok(s.listenerCounts() > 1)
  s.calls.length = 0
  s.setAudio({ enabled: false, unlocked: false })
  assert.ok(s.calls.includes('humStop'))
  assert.equal(s.listenerCounts(), 1)
  s.calls.length = 0
  s.message()
  assert.deepEqual(s.calls, [])
})

test('the failover two-tone plays when a leader is replaced, not when a leader is first learned', () => {
  const s = setup()
  s.setQuorum({ leaderId: null, isLeader: false, term: 0 })
  attachSoundWiring(s.deps)
  s.setAudio({ enabled: true, unlocked: true })
  s.setQuorum({ leaderId: 'tab-a', term: 1 }) // learning who leads
  assert.ok(!s.calls.includes('failover'))
  s.setQuorum({ leaderId: null }) // tab-a closed
  assert.ok(!s.calls.includes('failover'), 'a loss alone is not yet a failover')
  s.setQuorum({ leaderId: 'tab-self', isLeader: true, term: 2 })
  assert.equal(s.calls.filter((c) => c === 'failover').length, 1)
})

test('the failover two-tone also plays when a retried job recovers after an unplugged worker', () => {
  const s = setup()
  attachSoundWiring(s.deps)
  s.setAudio({ enabled: true, unlocked: true })
  s.calls.length = 0
  const recovery = { jobId: 'j3', kind: 'policy.fuzz' as const, node: 'policy-a', retry: 1, ms: 8, sentence: 'retry 1 · batch 3 → policy-a · recovered in 8 ms' }
  s.setCluster({ nodes: {}, queue: [], spans: [], recovery })
  assert.deepEqual(s.calls, ['failover'])
  s.setCluster({ nodes: {}, queue: [], spans: [], recovery }) // same recovery object: not news
  s.setCluster({ nodes: {}, queue: [{ id: 'j4', kind: 'policy.fuzz', attempts: 1 }], spans: [], recovery })
  assert.deepEqual(s.calls, ['failover'])
})
