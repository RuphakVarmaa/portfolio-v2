import { useSyncExternalStore } from 'react'
import { announce } from '../../cluster/live-region.ts'
import { quorum } from '../../cluster/quorum.ts'
import { scheduler } from '../../cluster/scheduler.ts'
import { EMPTY_CHAOS, createChaosStore, type ChaosSnapshot, type ChaosStore } from './chaos-store.ts'
import { getOperator } from './useOperatorStamp.ts'

let instance: ChaosStore | null = null

/**
 * The page's one Chaos Lab store, wired to the real scheduler, quorum, operator record and live region.
 * Created on first use in the browser (never at import).
 */
export function getChaos(): ChaosStore {
  instance ??= createChaosStore({
    scheduler,
    quorum,
    now: () => performance.now(),
    operator: { complete: (step) => getOperator().complete(step) },
    announce: (text) => announce(text),
  })
  return instance
}

/** Everything the lab has observed: log, rewards, plug run, departed tabs. Empty on the server. */
export function useChaos(): ChaosSnapshot {
  return useSyncExternalStore(
    (listener) => getChaos().subscribe(listener),
    () => getChaos().getSnapshot(),
    () => EMPTY_CHAOS,
  )
}
