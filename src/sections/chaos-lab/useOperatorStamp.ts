import { useSyncExternalStore } from 'react'
import { announce } from '../../cluster/live-region.ts'
import { copy } from '../../data/copy.ts'
import {
  EMPTY_OPERATOR,
  OPERATOR_EVENT,
  OPERATOR_KEY,
  OPERATOR_STEPS_KEY,
  OPERATOR_VALUE,
  createOperator,
  type Operator,
  type OperatorState,
} from './operator.ts'

let instance: Operator | null = null

/**
 * The browser's operator record. Created on first use (never at import, so the server and the tests touch
 * nothing). Whenever the stamp is earned or restored, `<html data-operator="v3">` is set (a hook for any
 * section's CSS) and `OPERATOR_EVENT` is dispatched on `window`: the Colophon listens for it and lights its
 * own Experiments link. The stamp is announced once, by the call that earns it.
 */
export function getOperator(): Operator {
  instance ??= createOperator(() => localStorage, {
    onChange: (state) => {
      const root = document.documentElement
      if (state.earned) root.dataset.operator = OPERATOR_VALUE
      else delete root.dataset.operator
      window.dispatchEvent(new Event(OPERATOR_EVENT))
    },
    onEarned: () => announce(`${copy.chaos.stamp}. ${copy.chaos.complete}`),
  })
  return instance
}

function subscribe(listener: () => void): () => void {
  const operator = getOperator()
  // Reads storage (and sets <html data-operator> for a restored stamp) now that the page is interactive.
  operator.sync()
  const off = operator.subscribe(listener)
  // Another tab completed a step or earned the stamp.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === OPERATOR_KEY || event.key === OPERATOR_STEPS_KEY) operator.sync()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    off()
    window.removeEventListener('storage', onStorage)
  }
}

/** Which experiments are done and whether CERTIFIED OPERATOR is earned. Nothing earned on the server. */
export function useOperatorStamp(): OperatorState {
  return useSyncExternalStore(subscribe, () => getOperator().getSnapshot(), () => EMPTY_OPERATOR)
}
