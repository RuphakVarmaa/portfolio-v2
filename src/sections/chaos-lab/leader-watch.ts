/**
 * Leader-loss detection: a small pure state machine over successive quorum snapshots.
 *
 * The quorum (src/cluster/quorum.ts) tells a tab who leads and at which term. It does not say "the
 * leader just went away". That is what the third experiment, the leader hum and the failover tone all
 * need, so it is derived here, from nothing but what the tab observed:
 *
 *   lost     the leader that was ANOTHER tab is gone (to nobody, or straight to someone else)
 *   elected  a different leader now exists at a HIGHER term than the one that was lost
 *
 * A BYE from the old leader and the Web Lock hand-over arrive in either order, so a tab may see
 * `leader -> none -> new leader` or `leader -> new leader`; both resolve to one `lost` and one
 * `elected`. The very first election of a lone tab, or learning who already leads, is not a loss.
 */

export interface LeaderObservation {
  /** This tab's id. */
  selfId: string
  leaderId: string | null
  term: number
}

export type LeaderEvent =
  | { type: 'lost'; lostId: string; term: number; at: number }
  | { type: 'elected'; leaderId: string; term: number; lostId: string; ms: number; self: boolean }

export interface LeaderWatch {
  /** Feed every quorum snapshot, in order. Returns the events this snapshot completes (usually none). */
  observe(next: LeaderObservation): LeaderEvent[]
}

export function createLeaderWatch(now: () => number): LeaderWatch {
  let previous: LeaderObservation | null = null
  let pending: { lostId: string; termBefore: number; at: number } | null = null

  return {
    observe(next) {
      const events: LeaderEvent[] = []
      const before = previous
      previous = next
      if (before === null) return events

      const was = before.leaderId
      if (was !== null && was !== next.selfId && next.leaderId !== was && pending === null) {
        const at = now()
        pending = { lostId: was, termBefore: before.term, at }
        events.push({ type: 'lost', lostId: was, term: before.term, at })
      }

      if (pending !== null) {
        if (next.leaderId === pending.lostId) {
          // The leader that "went away" is back (a suspended tab woke up): there was no election.
          pending = null
        } else if (next.leaderId !== null && next.term > pending.termBefore) {
          events.push({
            type: 'elected',
            leaderId: next.leaderId,
            term: next.term,
            lostId: pending.lostId,
            ms: Math.max(0, now() - pending.at),
            self: next.leaderId === next.selfId,
          })
          pending = null
        }
      }
      return events
    },
  }
}
