import type { Quorum, QuorumState } from '../../cluster/quorum.ts'
import type { ClusterState, Scheduler } from '../../cluster/scheduler.ts'
import { copy } from '../../data/copy.ts'
import { plugReward, toneFor } from './format.ts'
import { createLeaderWatch } from './leader-watch.ts'
import type { Operator } from './operator.ts'
import type { PlugRun } from './plug.ts'

/**
 * What the Chaos Lab knows, held outside React so it survives the lazy-loaded panel mounting late, and
 * so the experiments can be completed in a tab whose lab the visitor has never scrolled to (the tab that
 * SURVIVES a leader being closed is usually showing the hero).
 *
 * It only ever OBSERVES the cluster (it subscribes to the scheduler and the quorum, which already exist)
 * and records what it saw:
 *
 *   log       an operator log of real events: workers up, plug pulled, retried and recovered, tabs joined
 *             and left, leaders lost and elected, with `performance.now()` stamps
 *   tab       experiment 2 latched the moment two tabs agree on a leader (with the live values then)
 *   leader    experiment 3 latched when a leader that was another tab is lost and replaced
 *   plug      experiment 1: the run the panel's runner reports through `setPlug`
 *   departed  tabs that were here and are gone, so the lamp of a lost leader can stay (dark) on the panel
 *
 * Nothing runs because of this store: it starts nothing, spawns nothing, sends nothing. Plain `.ts` with
 * injected dependencies so `node --test` drives it with a fake scheduler and quorum.
 */

export type LogTone = 'ink' | 'muted' | 'live' | 'cobalt'

export interface LogLine {
  id: number
  /** `performance.now()` when observed. */
  at: number
  text: string
  tone: LogTone
}

export interface TabResult {
  leaderId: string
  term: number
  nodes: number
  /** Ms from the visitor pressing "Open a second tab" in THIS tab to seeing the peer, when they did. */
  seenAfterMs: number | null
}

export interface LeaderResult {
  /** The leader after the failover. */
  nodeId: string
  term: number
  /** The tab that was lost. */
  lostId: string
  /** From this tab noticing the loss to seeing the new leader. */
  ms: number
  /** True when this tab is the new leader. */
  self: boolean
}

export interface Departed {
  id: string
  wasLeader: boolean
}

export interface ChaosSnapshot {
  log: readonly LogLine[]
  tab: TabResult | null
  leader: LeaderResult | null
  plug: PlugRun | null
  departed: readonly Departed[]
}

export const EMPTY_CHAOS: ChaosSnapshot = Object.freeze({
  log: Object.freeze([]) as readonly LogLine[],
  tab: null,
  leader: null,
  plug: null,
  departed: Object.freeze([]) as readonly Departed[],
})

export const MAX_LOG_LINES = 120
export const MAX_DEPARTED = 3
/** A click on "Open a second tab" counts toward `seenAfterMs` for this long. */
export const CLICK_WINDOW_MS = 30_000

export interface ChaosDeps {
  scheduler: Pick<Scheduler, 'subscribe' | 'getState'>
  quorum: Pick<Quorum, 'subscribe' | 'getState'>
  now: () => number
  operator: Pick<Operator, 'complete'>
  announce: (text: string) => void
}

export interface ChaosStore {
  getSnapshot(): ChaosSnapshot
  subscribe(listener: () => void): () => void
  /** Begin observing. Reference-counted: the returned function releases this caller's claim. */
  start(): () => void
  log(text: string, tone?: LogTone): void
  /** The plug runner reports every phase here; a finished run with a real recovery completes experiment 1. */
  setPlug(run: PlugRun): void
  /** The visitor pressed "Open a second tab" in this tab. */
  noteTabClick(): void
}

const isUp = (status: string | undefined) => status === 'ready' || status === 'busy'

export function createChaosStore(deps: ChaosDeps): ChaosStore {
  const listeners = new Set<() => void>()
  let snapshot: ChaosSnapshot = EMPTY_CHAOS
  let nextId = 1
  let claims = 0
  let release: (() => void) | null = null

  let prevCluster: ClusterState | null = null
  let prevQuorum: QuorumState | null = null
  let sawAlone = false
  let announcedStart = false
  /** Tabs the leader watch has reported lost. A lock hand-over can arrive before the BYE, so `isLeader` alone would forget. */
  const lostLeaders = new Set<string>()
  let clickAt: number | null = null
  let plugCompletedFor: number | null = null
  let watch = createLeaderWatch(deps.now)

  const publish = (patch: Partial<ChaosSnapshot>) => {
    snapshot = { ...snapshot, ...patch }
    for (const listener of [...listeners]) listener()
  }

  const push = (text: string, tone: LogTone = 'ink') => {
    const line: LogLine = { id: nextId++, at: deps.now(), text, tone }
    const log = snapshot.log.length >= MAX_LOG_LINES ? [...snapshot.log.slice(1), line] : [...snapshot.log, line]
    publish({ log })
  }

  // ---- the scheduler: what the cluster says about itself ------------------------------------------

  const onScheduler = () => {
    const state = deps.scheduler.getState()
    const before = prevCluster
    prevCluster = state
    if (before === null) return
    if (state.lastEvent && state.lastEvent !== before.lastEvent) push(state.lastEvent, toneFor(state.lastEvent))
    if (state.nodes === before.nodes) return
    for (const [id, node] of Object.entries(state.nodes)) {
      const was = before.nodes[id]
      if (isUp(node.status) && !isUp(was?.status) && node.readyAt !== undefined) {
        const ms = Math.round(node.readyAt - node.spawnedAt)
        push(`${id} ${was?.status === 'dead' ? 'respawned' : 'is up'} in ${ms} ms`, 'muted')
      }
    }
  }

  // ---- the quorum: tabs, leaders, terms --------------------------------------------------------------

  const onQuorum = () => {
    const state = deps.quorum.getState()
    const before = prevQuorum
    prevQuorum = state
    if (state.term === 0) return

    if (!announcedStart) {
      announcedStart = true
      push(`${state.nodeId} (this tab) started · ${state.isLeader ? 'leader' : 'follower'} · term ${state.term}`, 'muted')
    }
    if (state.nodes === 1) sawAlone = true

    if (before !== null) {
      const known = new Set(before.members.map((member) => member.id))
      const present = new Set(state.members.map((member) => member.id))
      for (const member of state.members) {
        if (member.isSelf || known.has(member.id)) continue
        push(`${member.id} joined`, 'cobalt')
        if (snapshot.departed.some((d) => d.id === member.id)) publish({ departed: snapshot.departed.filter((d) => d.id !== member.id) })
      }
      for (const member of before.members) {
        if (member.isSelf || present.has(member.id)) continue
        const wasLeader = member.isLeader || lostLeaders.has(member.id)
        push(`${member.id} left${wasLeader ? ' (it was the leader)' : ''}`, 'live')
        publish({ departed: [{ id: member.id, wasLeader }, ...snapshot.departed].slice(0, MAX_DEPARTED) })
      }
    }

    for (const event of watch.observe({ selfId: state.nodeId, leaderId: state.leaderId, term: state.term })) {
      if (event.type === 'lost') {
        lostLeaders.add(event.lostId)
        // It may already be gone from the member list (BYE first, then the hand-over): mark its dark lamp.
        if (snapshot.departed.some((d) => d.id === event.lostId && !d.wasLeader)) {
          publish({ departed: snapshot.departed.map((d) => (d.id === event.lostId ? { ...d, wasLeader: true } : d)) })
        }
        push(`leader lost: ${event.lostId} went away`, 'live')
      } else {
        push(`${event.leaderId} took the lock · term ${event.term}${event.self ? ' (this tab)' : ''}`, 'cobalt')
        const result: LeaderResult = { nodeId: event.leaderId, term: event.term, lostId: event.lostId, ms: event.ms, self: event.self }
        publish({ leader: result })
        // The reward is announced before the step is recorded: if this was the last step, the stamp is
        // announced by `complete`, and "what you proved" should be heard before "what you earned".
        deps.announce(copy.chaos.experiments.leader.reward({ nodeId: result.nodeId, term: result.term }))
        deps.operator.complete('leader')
      }
    }

    // Experiment 2: two tabs that agree on a leader. Latched with the values at that moment.
    if (snapshot.tab === null && state.nodes >= 2 && state.leaderId !== null) {
      const waited = clickAt !== null && deps.now() - clickAt < CLICK_WINDOW_MS ? Math.round(deps.now() - clickAt) : null
      const result: TabResult = { leaderId: state.leaderId, term: state.term, nodes: state.nodes, seenAfterMs: waited }
      publish({ tab: result })
      push(`${result.nodes} tabs agree: ${result.leaderId} leads · term ${result.term}`, 'cobalt')
      // Only the tab that WAS alone announces; the newcomer would just be repeating it to itself.
      if (sawAlone) deps.announce(copy.chaos.experiments.tab.reward({ leaderId: result.leaderId, term: result.term }))
      deps.operator.complete('tab')
    }
  }

  const attach = () => {
    prevCluster = deps.scheduler.getState()
    prevQuorum = null
    watch = createLeaderWatch(deps.now)
    const offScheduler = deps.scheduler.subscribe(onScheduler)
    const offQuorum = deps.quorum.subscribe(onQuorum)
    onQuorum()
    return () => {
      offScheduler()
      offQuorum()
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start() {
      claims += 1
      if (claims === 1) release = attach()
      let released = false
      return () => {
        if (released) return
        released = true
        claims -= 1
        if (claims === 0) {
          release?.()
          release = null
        }
      }
    },
    log: push,
    setPlug(run) {
      publish({ plug: run })
      const reward = plugReward(run)
      if (reward !== null && plugCompletedFor !== run.startedAt) {
        plugCompletedFor = run.startedAt
        deps.announce(reward)
        deps.operator.complete('plug')
      }
    },
    noteTabClick() {
      clickAt = deps.now()
    },
  }
}
