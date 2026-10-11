import { useEffect } from 'react'

/**
 * Start the Chaos Lab's observers (observers.ts) while `enabled`, loading them as their own chunk right after
 * the first paint so the code that watches the cluster stays out of the initial bundle. Used by the home
 * page's lab (off while "Skip the machine" is on) and by /experiments/ (always on), so an experiment is
 * credited in whichever of those pages the surviving tab happens to be showing. `respectMachineOff` is for the
 * home page's lab, which "Skip the machine" replaces with a plain list; /experiments/ keeps observing.
 */
export function useLabObservers(enabled: boolean, respectMachineOff = false): void {
  useEffect(() => {
    if (!enabled) return
    // At hydration the preference store still holds its server snapshot (machine on), but the pre-paint script
    // has already put the visitor's real choice on <html>. Do not fetch the observers for a lab that is about
    // to be replaced by the plain list. Turning the machine back on re-runs this effect.
    if (respectMachineOff && document.documentElement.dataset.machine === 'off') return
    let stopped = false
    let stop: (() => void) | undefined
    import('./observers.ts').then(
      ({ startObservers }) => {
        if (!stopped) stop = startObservers()
      },
      () => {
        /* offline or blocked: the pieces themselves fail the same way and say so; only the background bookkeeping is lost */
      },
    )
    return () => {
      stopped = true
      stop?.()
    }
  }, [enabled, respectMachineOff])
}
