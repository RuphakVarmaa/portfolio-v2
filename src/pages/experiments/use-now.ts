import { useSyncExternalStore } from 'react'

/**
 * `performance.now()` as of the last second, for "heard 2 s ago" style readouts. One shared interval runs
 * only while something is subscribed; the value is cached per tick, so reading it during render is pure
 * (render never calls the clock itself) and the server snapshot is a constant.
 */
let value = 0
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (timer === undefined) {
    value = performance.now()
    timer = setInterval(() => {
      value = performance.now()
      for (const l of [...listeners]) l()
    }, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, () => value, () => 0)
}
