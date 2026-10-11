import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OPERATOR_KEY, OPERATOR_VALUE, readOperator } from './operator.ts'

const store = (value: string | null) => ({ getItem: (key: string) => (key === OPERATOR_KEY ? value : null) })

test('the stamp is earned only when the Chaos Lab stored its exact value', () => {
  assert.equal(readOperator(store(OPERATOR_VALUE)), true)
  assert.equal(readOperator(store(null)), false)
  assert.equal(readOperator(store('v2')), false)
  assert.equal(readOperator(store('')), false)
})

test('blocked or missing storage means not earned, never an error', () => {
  assert.equal(readOperator(null), false)
  assert.equal(readOperator({ getItem: () => { throw new Error('SecurityError') } }), false)
  assert.equal(readOperator(), false, 'no localStorage in Node')
})

test('the key and value are the ones the spec names (4.7)', () => {
  assert.equal(OPERATOR_KEY, 'ruphak-operator')
  assert.equal(OPERATOR_VALUE, 'v3')
})
