import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eagerServices } from './boot.ts'

test('full tier spawns every service on the home page, standard holds vision on standby, basic spawns nothing', () => {
  assert.deepEqual(eagerServices('full', { kind: 'home' }), ['retrieval', 'vision', 'policy', 'review'])
  assert.deepEqual(eagerServices('standard', { kind: 'home' }), ['retrieval', 'policy', 'review'])
  assert.deepEqual(eagerServices('basic', { kind: 'home' }), [])
})

test('a project page spawns only its own service, other routes spawn none', () => {
  assert.deepEqual(eagerServices('full', { kind: 'project', id: 'policy' }), ['policy'])
  assert.deepEqual(eagerServices('standard', { kind: 'project', id: 'vision' }), ['vision'])
  assert.deepEqual(eagerServices('basic', { kind: 'project', id: 'policy' }), [])
  for (const route of [{ kind: 'resume' }, { kind: 'experiments' }, { kind: 'notfound' }] as const) {
    assert.deepEqual(eagerServices('full', route), [])
  }
})
