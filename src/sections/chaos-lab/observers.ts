import { getChaos } from './chaos.ts'
import { getOperator } from './useOperatorStamp.ts'

/**
 * What the Chaos Lab does from the moment the page is up, whether or not its bench is ever scrolled to.
 * It is its own chunk, loaded by index.tsx right after the first paint, so the code that watches the cluster
 * stays out of the initial bundle.
 *
 *  - the stored operator stamp is read, which sets `<html data-operator>` and tells the Colophon
 *  - the Chaos Lab store starts OBSERVING the scheduler and the quorum, so an experiment can be completed in
 *    a tab that never showed the lab: the tab that SURVIVES a closed leader is usually showing the hero
 *
 * Observing starts nothing, spawns nothing and sends nothing. Returns the function that stops it.
 */
export function startObservers(): () => void {
  getOperator().sync()
  return getChaos().start()
}
