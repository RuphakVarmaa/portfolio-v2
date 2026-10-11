import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStore } from './store.ts'

test('patching merges into the state and notifies subscribers once', () => {
  const store = createStore({ a: 1, b: 'x' })
  let calls = 0
  store.subscribe(() => {
    calls += 1
  })
  store.patch({ a: 2 })
  assert.deepEqual(store.get(), { a: 2, b: 'x' })
  assert.equal(calls, 1)
})

test('patching with the same values changes nothing and notifies nobody (the state object keeps its identity)', () => {
  const store = createStore({ a: 1, list: [1] })
  const before = store.get()
  let calls = 0
  store.subscribe(() => {
    calls += 1
  })
  store.patch({ a: 1 })
  store.patch({})
  assert.equal(store.get(), before)
  assert.equal(calls, 0)
  store.patch({ list: [1] })
  assert.equal(calls, 1, 'a new array is a change: callers pass a new array only when the contents changed')
})

test('an unsubscribed listener is not called again', () => {
  const store = createStore({ n: 0 })
  let calls = 0
  const off = store.subscribe(() => {
    calls += 1
  })
  store.patch({ n: 1 })
  off()
  store.patch({ n: 2 })
  assert.equal(calls, 1)
})
