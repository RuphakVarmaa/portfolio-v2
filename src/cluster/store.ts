import { useCallback, useRef, useSyncExternalStore } from 'react'
import { EMPTY_CLUSTER_STATE, scheduler, type ClusterState } from './scheduler.ts'
import { jobsInFlight, servicePhase, type ServicePhase } from './phase.ts'
import type { ServiceId } from './protocol.ts'
import { SERVER_QUORUM_STATE, quorum, type QuorumState } from './quorum.ts'
import { SERVER_TIER_INFO, getTierInfo, subscribeTier, type TierInfo } from './tier.ts'

/**
 * React bindings for the cluster. Every hook has a server snapshot (an empty cluster, term 0, tier
 * full) so the prerendered HTML is deterministic; the real values arrive after hydration.
 *
 * `useClusterState(selector)` is a store selector: return a primitive or an existing part of the state
 * (`s => s.nodes`, `s => s.nodes['policy-b']?.status`, `s => s.lastEvent`). The result is compared
 * shallowly, so returning a fresh array/object of equal contents does not re-render or loop, but
 * deriving big arrays on every call is wasteful: select a subtree and `useMemo` over it instead.
 */

export { useTelemetry } from './telemetry.ts'

function isShallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((key) => Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

function useSelectedStore<S, T>(
  subscribe: (listener: () => void) => () => void,
  getState: () => S,
  getServerState: () => S,
  selector: (state: S) => T,
): T {
  const memo = useRef<{ selector: (state: S) => T; state: S; selection: T } | null>(null)
  const getSnapshot = useCallback(
    (state: S): T => {
      const previous = memo.current
      if (previous && previous.state === state && previous.selector === selector) return previous.selection
      const next = selector(state)
      const selection = previous && isShallowEqual(previous.selection, next) ? previous.selection : next
      memo.current = { selector, state, selection }
      return selection
    },
    [selector],
  )
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot(getState()),
    () => getSnapshot(getServerState()),
  )
}

/** Select from the scheduler's cluster state. Re-renders only when the selected value changes. */
export function useClusterState<T>(selector: (state: ClusterState) => T): T {
  return useSelectedStore(scheduler.subscribe, scheduler.getState, () => EMPTY_CLUSTER_STATE, selector)
}

/** The whole-service phase (`standby | starting | ready | busy | degraded | down`). A string, so it only re-renders on change. */
export function useServicePhase(service: ServiceId): ServicePhase {
  return useClusterState((state) => servicePhase(state, service))
}

/** How many jobs of the service are running on a worker right now (0 when idle: the cable is not hot). */
export function useJobsInFlight(service: ServiceId): number {
  return useClusterState((state) => jobsInFlight(state, service))
}

/** The tab quorum: node count, term, leader, peers. Before the quorum starts (and on the server) `term` is 0. */
export function useQuorum(): QuorumState {
  return useSyncExternalStore(
    (listener) => (typeof window === 'undefined' ? () => undefined : quorum.subscribe(listener)),
    quorum.getState,
    () => SERVER_QUORUM_STATE,
  )
}

/** The device tier chosen at startup, with the reasons. `full` on the server and until `detectTier()` has run. */
export function useTierInfo(): TierInfo {
  return useSyncExternalStore(subscribeTier, getTierInfo, () => SERVER_TIER_INFO)
}
