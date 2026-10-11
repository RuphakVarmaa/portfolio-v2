import { useSyncExternalStore } from 'react'

const subscribe = () => () => undefined

/**
 * False on the server and during hydration, true as soon as the page is interactive (and immediately when a
 * root is created on the client). Controls that do nothing without JavaScript (`data-js-only`) render only
 * once this is true, so the prerendered HTML stays small; their space is reserved in CSS, so nothing shifts.
 * React uses the server snapshot for the hydrating render, so the first client render matches the server's.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
