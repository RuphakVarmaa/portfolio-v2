import { useEffect, useSyncExternalStore, type RefObject } from 'react'

/**
 * The "Certified Operator" stamp (spec 4.7): the Chaos Lab writes `localStorage['ruphak-operator'] = 'v3'`
 * when a visitor has done all three experiments, and the Colophon's Experiments link "lights" (it was always
 * reachable at /experiments/; nothing is gated). This file only READS that flag.
 *
 * Reading is cheap, so the snapshot is re-read whenever it could have changed: another tab wrote it (the
 * `storage` event), the tab came back (`focus`, `visibilitychange`), the Colophon scrolled into view (the
 * stamp is earned above it, so this is the moment a visitor would notice), or the Chaos Lab announced it by
 * dispatching `OPERATOR_EVENT` on `window` (optional; nothing else depends on it). No timers.
 */

export const OPERATOR_KEY = 'ruphak-operator'
export const OPERATOR_VALUE = 'v3'
export const OPERATOR_EVENT = 'ruphak-operator'

type Reader = Pick<Storage, 'getItem'>

/** True when the stamp is stored. False on any failure (private windows and blocked storage can throw). */
export function readOperator(storage?: Reader | null): boolean {
  try {
    const store = storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : storage
    return store?.getItem(OPERATOR_KEY) === OPERATOR_VALUE
  } catch {
    return false
  }
}

const listeners = new Set<() => void>()
const notify = () => {
  for (const listener of [...listeners]) listener()
}

const EVENTS: Array<[EventTarget, string]> = []

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1 && typeof window !== 'undefined') {
    EVENTS.push([window, 'storage'], [window, 'focus'], [window, OPERATOR_EVENT], [document, 'visibilitychange'])
    for (const [target, name] of EVENTS) target.addEventListener(name, notify)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) for (const [target, name] of EVENTS.splice(0)) target.removeEventListener(name, notify)
  }
}

/** Is the stamp earned? `watch` is the element to re-read on when it scrolls into view (the Colophon). */
export function useOperatorStamp(watch: RefObject<Element | null>): boolean {
  const stamped = useSyncExternalStore(subscribe, () => readOperator(), () => false)
  useEffect(() => {
    const element = watch.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) notify()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [watch])
  return stamped
}
