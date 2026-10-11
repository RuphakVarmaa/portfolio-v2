import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { EngineSnapshot, Pipeline } from './Pipeline.ts'

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

/**
 * Read part of the pipeline's state. The pipeline publishes up to ten updates a second while it runs, but
 * a component that selects only what it draws (the controls, the status line) re-renders only when that
 * part changes. Return primitives or a small object of them; equal contents do not re-render.
 */
export function useEngine<T>(engine: Pipeline, selector: (snapshot: EngineSnapshot) => T): T {
  const memo = useRef<{ selector: (snapshot: EngineSnapshot) => T; state: EngineSnapshot; selection: T } | null>(null)
  const read = useCallback(
    (state: EngineSnapshot): T => {
      const previous = memo.current
      if (previous && previous.state === state && previous.selector === selector) return previous.selection
      const next = selector(state)
      const selection = previous && shallowEqual(previous.selection, next) ? previous.selection : next
      memo.current = { selector, state, selection }
      return selection
    },
    [selector],
  )
  return useSyncExternalStore(engine.store.subscribe, () => read(engine.store.get()))
}
