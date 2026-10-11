/**
 * The operator stamp: which of the three Chaos Lab experiments this visitor has completed, and whether
 * that earns CERTIFIED OPERATOR.
 *
 *   localStorage['ruphak-operator']        'v3' once all three are done (spec 4.7); never cleared by this code
 *   localStorage['ruphak-operator-steps']  'plug,tab,leader' (a subset): progress, shared by every tab
 *
 * Progress is stored rather than held in memory because the third experiment is completed in the tab
 * that SURVIVES: the visitor pulls the plug and opens a second tab in one tab, then closes that tab to
 * kill the leader, and the other tab finishes the job. Each completion is a read-merge-write, so two
 * tabs can never overwrite each other's steps.
 *
 * Pure and storage-injected (no window, document or localStorage at import), so `node --test` covers it.
 * Every storage access is wrapped: private windows and blocked storage must not break the page, and the
 * stamp then simply lives for the visit.
 */

import { OPERATOR_EVENT, OPERATOR_KEY, OPERATOR_STEPS_KEY, OPERATOR_VALUE } from './operator-keys.ts'

export { OPERATOR_EVENT, OPERATOR_KEY, OPERATOR_STEPS_KEY, OPERATOR_VALUE }

export type OperatorStep = 'plug' | 'tab' | 'leader'
export const OPERATOR_STEPS: readonly OperatorStep[] = ['plug', 'tab', 'leader']

export interface OperatorState {
  readonly steps: Readonly<Record<OperatorStep, boolean>>
  readonly earned: boolean
}

export const EMPTY_OPERATOR: OperatorState = Object.freeze({
  steps: Object.freeze({ plug: false, tab: false, leader: false }),
  earned: false,
})

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface OperatorHooks {
  /** Called when THIS call completed the last step (never when another tab did, never when restoring). */
  onEarned?: () => void
  /** Called whenever the published state changes, including a restore from storage. */
  onChange?: (state: OperatorState) => void
}

export interface Operator {
  getSnapshot(): OperatorState
  subscribe(listener: () => void): () => void
  /** Record a finished experiment. Returns true when this call earned the stamp. */
  complete(step: OperatorStep): boolean
  /** Re-read storage (another tab may have written to it). */
  sync(): void
}

/** `'plug,tab'` -> `{plug, tab}`. Unknown words are ignored. */
export function parseSteps(raw: string | null): Set<OperatorStep> {
  const steps = new Set<OperatorStep>()
  for (const word of (raw ?? '').split(',')) {
    const step = word.trim() as OperatorStep
    if (OPERATOR_STEPS.includes(step)) steps.add(step)
  }
  return steps
}

export function serializeSteps(steps: ReadonlySet<OperatorStep>): string {
  return OPERATOR_STEPS.filter((step) => steps.has(step)).join(',')
}

function stateOf(steps: ReadonlySet<OperatorStep>, stamped: boolean): OperatorState {
  const record = { plug: steps.has('plug'), tab: steps.has('tab'), leader: steps.has('leader') }
  return { steps: record, earned: stamped || (record.plug && record.tab && record.leader) }
}

const same = (a: OperatorState, b: OperatorState) =>
  a.earned === b.earned && a.steps.plug === b.steps.plug && a.steps.tab === b.steps.tab && a.steps.leader === b.steps.leader

export function createOperator(getStorage: () => StorageLike | null, hooks: OperatorHooks = {}): Operator {
  const listeners = new Set<() => void>()
  let memory = new Set<OperatorStep>()
  let stampedInMemory = false
  let snapshot: OperatorState | null = null
  let synced = false

  const storage = (): StorageLike | null => {
    try {
      return getStorage()
    } catch {
      return null
    }
  }

  /** What the world says right now: storage merged with what this tab remembers (storage may be blocked). */
  const read = (): OperatorState => {
    const store = storage()
    let stored = new Set<OperatorStep>()
    let stamped = false
    try {
      stored = parseSteps(store?.getItem(OPERATOR_STEPS_KEY) ?? null)
      stamped = store?.getItem(OPERATOR_KEY) === OPERATOR_VALUE
    } catch {
      /* blocked: memory only */
    }
    return stateOf(new Set([...memory, ...stored]), stamped || stampedInMemory)
  }

  const publish = (next: OperatorState) => {
    const changed = snapshot === null || !same(snapshot, next)
    snapshot = next
    // `onChange` also fires once for the very first sync, so a stamp restored from storage still
    // reaches <html data-operator>; reading the snapshot during render never has side effects.
    if (changed || !synced) hooks.onChange?.(next)
    synced = true
    if (changed) for (const listener of [...listeners]) listener()
  }

  return {
    getSnapshot() {
      snapshot ??= read()
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    complete(step) {
      const before = snapshot ?? read()
      const merged = new Set<OperatorStep>([...memory, ...parseSteps(safeGet(storage(), OPERATOR_STEPS_KEY)), step])
      memory = merged
      const after = stateOf(merged, before.earned)
      const store = storage()
      try {
        store?.setItem(OPERATOR_STEPS_KEY, serializeSteps(merged))
        if (after.earned) store?.setItem(OPERATOR_KEY, OPERATOR_VALUE)
      } catch {
        /* blocked: the stamp lives for this visit */
      }
      if (after.earned) stampedInMemory = true
      const newlyEarned = after.earned && !before.earned
      publish(after)
      if (newlyEarned) hooks.onEarned?.()
      return newlyEarned
    },
    sync() {
      publish(read())
    },
  }
}

function safeGet(store: StorageLike | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null
  } catch {
    return null
  }
}
