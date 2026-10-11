/**
 * A tiny external store for `useSyncExternalStore`. The Vision pipeline lives outside React (it owns a
 * camera, a worker queue and timers), so React reads it through stores like this one: the pipeline calls
 * `patch`, components subscribe. No dependency, no context, and nothing is re-rendered unless a value
 * actually changed.
 */

export interface Store<T extends object> {
  /** The current state. The same object until something changes (what `useSyncExternalStore` needs). */
  get(): T
  /** Merge `partial` into the state. Subscribers are notified only when some value differs (`Object.is`). */
  patch(partial: Partial<T>): void
  subscribe(listener: () => void): () => void
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    patch(partial) {
      let changed = false
      for (const key of Object.keys(partial) as Array<keyof T>) {
        if (!Object.is(state[key], partial[key])) {
          changed = true
          break
        }
      }
      if (!changed) return
      state = { ...state, ...partial }
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
