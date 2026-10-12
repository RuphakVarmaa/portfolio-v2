import type { QuorumState } from '../../cluster/quorum.ts'

/**
 * What the hero says about the quorum (spec 3.2 and 3.4, signature moment 1): a second tab joined, and (review
 * round 2, creative) the leader was lost and this tab took over. The promise in the hero is "close whichever
 * tab is leader and the other takes over", so the payoff has to appear where the promise was made, not only
 * in the Chaos Lab further down the page.
 *
 * Both are things this tab OBSERVED, and nothing else:
 *   joined    the number of live tabs went up to two or more. The tab that has just opened (`newcomer`) is the one that
 *             joined; the tab that was already open is the one joined. Each says its own side (review round 2: the new
 *             tab used to call itself "that tab")
 *   failover  the leader that was another tab went away, and a different leader now holds a higher term
 *
 * The failover rule is the same one the Chaos Lab's store applies (a leader that was ANOTHER tab is lost; a different
 * leader at a HIGHER term replaces it), written out again here so the hero does not depend on a lazily loaded section.
 * A BYE from the old leader and the Web Lock's hand-over arrive in either order, so this tab may see
 * `leader -> none -> new leader` or `leader -> new leader`; both resolve to one failover. Learning who already leads
 * (`none -> leader`) and a lone tab's first election are not failovers, and neither is a leader that comes back.
 *
 * Pure and DOM-free: the component keeps one `NoticeMemory` in state (the "remember the previous render" pattern, as the
 * boot line does) and `advanceNotice` returns the very same object when the quorum has not changed, so a render that
 * repeats changes nothing. `node --test` imports this file directly.
 */

/** The part of `QuorumState` the notice reads. */
export type QuorumSight = Pick<QuorumState, 'nodeId' | 'nodes' | 'term' | 'leaderId' | 'newcomer'>

export interface Failover {
  /** The tab that holds the lock now (this tab's own id when it took over). */
  nodeId: string
  term: number
  /** True when this very tab is the new leader. */
  self: boolean
}

export type Latest = { readonly kind: 'joined'; readonly newcomer: boolean } | ({ readonly kind: 'failover' } & Failover)

export interface NoticeMemory {
  /** The last quorum this tab looked at; null before the first. */
  readonly seen: QuorumSight | null
  /** A leader that was another tab went away, and the election that replaces it has not been seen yet. */
  readonly pending: { readonly lostId: string; readonly termBefore: number } | null
  /** The latest thing worth a line, or null. */
  readonly latest: Latest | null
  /** Counts the events, so the line can be redrawn (its entrance flash replays) for each new one. */
  readonly seq: number
}

export const NO_NOTICE: NoticeMemory = Object.freeze({ seen: null, pending: null, latest: null, seq: 0 })

const sameSight = (a: QuorumSight, b: QuorumSight) =>
  a.nodeId === b.nodeId && a.nodes === b.nodes && a.term === b.term && a.leaderId === b.leaderId && a.newcomer === b.newcomer

/** Fold the quorum as it is now into what this tab remembers. Returns `memory` itself when nothing changed. */
export function advanceNotice(memory: NoticeMemory, now: QuorumSight): NoticeMemory {
  const before = memory.seen
  if (before !== null && sameSight(before, now)) return memory

  const seen: QuorumSight = { nodeId: now.nodeId, nodes: now.nodes, term: now.term, leaderId: now.leaderId, newcomer: now.newcomer }
  let pending = memory.pending
  let failover: Failover | null = null

  if (before !== null) {
    const was = before.leaderId
    if (pending === null && was !== null && was !== now.nodeId && now.leaderId !== was) {
      pending = { lostId: was, termBefore: before.term }
    }
    if (pending !== null) {
      if (now.leaderId === pending.lostId) {
        pending = null // the leader that "went away" is back (a suspended tab woke up): there was no election
      } else if (now.leaderId !== null && now.term > pending.termBefore) {
        failover = { nodeId: now.leaderId, term: now.term, self: now.leaderId === now.nodeId }
        pending = null
      }
    }
  }

  const joined = now.nodes >= 2 && (before === null || now.nodes > before.nodes)
  let latest = memory.latest
  let seq = memory.seq
  if (failover !== null) {
    latest = { kind: 'failover', ...failover }
    seq += 1
  } else if (joined) {
    latest = { kind: 'joined', newcomer: now.newcomer }
    seq += 1
  }
  return { seen, pending, latest, seq }
}

/** The words the notice is made of (copy.ts has them; this file only chooses between them). */
export interface NoticeText {
  /** A tab that was already open: another tab joined it. */
  joined: (nodes: number) => string
  /** The tab that has just opened: it joined another. */
  joinedNew: (nodes: number) => string
  failover: (took: { nodeId: string; term: number }) => string
  /** A tab's own id as the failover sentence names it (`tab-3b9a (this tab)`): the survivor is usually the tab that took the lock. */
  self: (nodeId: string) => string
  unsupported: string
  blocked: string
}

export interface NoticeLines {
  /** The announced line: arrivals, an unsupported browser, a blocked pop-up. */
  live: string
  /** The line that is only shown (not announced): the failover. The shared announcer already says who leads now, once. */
  still: string
}

/**
 * Which lines to show right now.
 *   - a browser without BroadcastChannel or Web Locks: the unsupported line, nothing else;
 *   - the latest event is a failover: its sentence (shown, not announced), and no arrival line beside it;
 *   - the latest event is an arrival and the tabs are still there: the arrival line;
 *   - otherwise only a blocked pop-up has anything to say.
 */
export function noticeLines(memory: NoticeMemory, view: Pick<QuorumState, 'supported' | 'nodes'>, blocked: boolean, text: NoticeText): NoticeLines {
  if (!view.supported) return { live: text.unsupported, still: '' }
  const latest = memory.latest
  if (latest?.kind === 'failover') {
    return { live: '', still: text.failover({ nodeId: latest.self ? text.self(latest.nodeId) : latest.nodeId, term: latest.term }) }
  }
  if (latest?.kind === 'joined' && view.nodes >= 2) return { live: latest.newcomer ? text.joinedNew(view.nodes) : text.joined(view.nodes), still: '' }
  return { live: blocked ? text.blocked : '', still: '' }
}
