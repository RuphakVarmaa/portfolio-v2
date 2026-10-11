import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EMPTY_OPERATOR,
  OPERATOR_KEY,
  OPERATOR_STEPS_KEY,
  createOperator,
  parseSteps,
  serializeSteps,
  type OperatorState,
  type StorageLike,
} from './operator.ts'

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

test('steps parse leniently and serialize in a fixed order', () => {
  assert.deepEqual([...parseSteps('leader, plug,nonsense,,plug')], ['leader', 'plug'])
  assert.deepEqual([...parseSteps(null)], [])
  assert.equal(serializeSteps(new Set(['leader', 'plug'] as const)), 'plug,leader')
})

test('nothing is earned until all three experiments are recorded, and only the last one earns the stamp', () => {
  const storage = memoryStorage()
  let earned = 0
  const operator = createOperator(() => storage, { onEarned: () => (earned += 1) })
  assert.deepEqual(operator.getSnapshot(), EMPTY_OPERATOR)
  assert.equal(operator.complete('plug'), false)
  assert.equal(operator.complete('tab'), false)
  assert.equal(operator.complete('tab'), false, 'completing a step twice changes nothing')
  assert.equal(storage.data.get(OPERATOR_KEY), undefined, 'no stamp yet')
  assert.equal(storage.data.get(OPERATOR_STEPS_KEY), 'plug,tab')
  assert.equal(operator.complete('leader'), true)
  assert.equal(operator.complete('leader'), false, 'earned once')
  assert.equal(earned, 1)
  assert.equal(storage.data.get(OPERATOR_KEY), 'v3')
  assert.equal(operator.getSnapshot().earned, true)
})

test('progress made in another tab is merged, so the surviving tab can finish the job', () => {
  const storage = memoryStorage()
  const survivor = createOperator(() => storage)
  survivor.getSnapshot()
  // The tab that is about to be closed did the first two experiments.
  const closing = createOperator(() => storage)
  closing.complete('plug')
  closing.complete('tab')
  // The survivor never saw them in memory, but completing the third merges with what storage holds.
  assert.equal(survivor.complete('leader'), true)
  assert.equal(survivor.getSnapshot().earned, true)
})

test('a stored stamp is restored silently: no "earned" callback, no announcement', () => {
  const storage = memoryStorage({ [OPERATOR_KEY]: 'v3' })
  let earned = 0
  const changes: OperatorState[] = []
  const operator = createOperator(() => storage, { onEarned: () => (earned += 1), onChange: (state) => changes.push(state) })
  assert.equal(operator.getSnapshot().earned, true)
  assert.equal(changes.length, 0, 'reading the snapshot (during render) has no side effects')
  operator.sync()
  assert.equal(earned, 0)
  assert.equal(operator.complete('plug'), false, 'already earned: completing a step does not earn it again')
  assert.equal(earned, 0)
  assert.equal(changes[0].earned, true, 'onChange reports the restore so <html data-operator> can be set')
})

test('sync picks up a stamp earned in another tab and tells subscribers', () => {
  const storage = memoryStorage()
  const operator = createOperator(() => storage)
  let calls = 0
  operator.subscribe(() => (calls += 1))
  operator.getSnapshot()
  storage.setItem(OPERATOR_STEPS_KEY, 'plug,tab,leader')
  operator.sync()
  assert.equal(operator.getSnapshot().earned, true)
  assert.equal(calls, 1)
  operator.sync()
  assert.equal(calls, 1, 'no change, no notification')
})

test('blocked storage (private window) never throws: the stamp is kept for the visit', () => {
  const throwing: StorageLike = {
    getItem() {
      throw new Error('SecurityError')
    },
    setItem() {
      throw new Error('QuotaExceededError')
    },
  }
  let earned = 0
  const operator = createOperator(() => throwing, { onEarned: () => (earned += 1) })
  assert.deepEqual(operator.getSnapshot(), EMPTY_OPERATOR)
  operator.complete('plug')
  operator.complete('tab')
  assert.equal(operator.complete('leader'), true)
  assert.equal(operator.getSnapshot().earned, true)
  assert.equal(earned, 1)
  const noStorage = createOperator(() => null)
  assert.equal(noStorage.complete('plug'), false)
  assert.equal(noStorage.getSnapshot().steps.plug, true)
})

test('a getStorage that throws is treated as no storage', () => {
  const operator = createOperator(() => {
    throw new Error('denied')
  })
  assert.deepEqual(operator.getSnapshot(), EMPTY_OPERATOR)
  assert.equal(operator.complete('tab'), false)
  assert.equal(operator.getSnapshot().steps.tab, true)
})
