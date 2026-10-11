import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PENDING_KEY, PENDING_TTL_MS, hasPending, savePending, takePending, type PendingCitation, type StorageLike } from './pending.ts'

function memory(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

const NOW = 1_700_000_000_000
const citation: PendingCitation = { anchor: 'service-policy', sentence: 'Tenant isolation is enforced twice.', depth: 'peer', plain: false, at: NOW }

test('a saved citation is taken once and then gone', () => {
  const storage = memory()
  assert.equal(hasPending(storage), false)
  assert.equal(savePending(citation, storage), true)
  assert.equal(hasPending(storage), true)
  assert.deepEqual(takePending(NOW + 1000, storage), { anchor: 'service-policy', sentence: 'Tenant isolation is enforced twice.', depth: 'peer', at: NOW })
  assert.equal(takePending(NOW + 1000, storage), null)
  assert.equal(hasPending(storage), false)
})

test('plain is kept only when true; the depth only when it is one of the three', () => {
  const storage = memory()
  savePending({ ...citation, plain: true, depth: undefined }, storage)
  assert.deepEqual(takePending(NOW, storage), { anchor: 'service-policy', sentence: citation.sentence, plain: true, at: NOW })
  storage.setItem(PENDING_KEY, JSON.stringify({ anchor: 'contact', sentence: 'Email is best.', depth: 'galaxy', at: NOW }))
  assert.deepEqual(takePending(NOW, storage), { anchor: 'contact', sentence: 'Email is best.', at: NOW })
})

test('a stale entry, a future entry and a malformed entry are ignored (and removed)', () => {
  const storage = memory()
  savePending(citation, storage)
  assert.equal(takePending(NOW + PENDING_TTL_MS + 1, storage), null)
  assert.equal(storage.map.size, 0)

  savePending({ ...citation, at: NOW + PENDING_TTL_MS * 3 }, storage)
  assert.equal(takePending(NOW, storage), null)

  for (const bad of ['not json', '[]', 'null', '"text"', JSON.stringify({ anchor: 'Bad Anchor', sentence: 'x y z', at: NOW }), JSON.stringify({ anchor: 'ok', sentence: '   ', at: NOW }), JSON.stringify({ anchor: 'ok', sentence: 'fine', at: 'now' })]) {
    storage.setItem(PENDING_KEY, bad)
    assert.equal(takePending(NOW, storage), null, bad)
    assert.equal(storage.map.size, 0, 'a bad entry is removed, not left to be tried again')
  }
})

test('the sentence is capped when saved, and an over-long stored one is refused', () => {
  const storage = memory()
  savePending({ ...citation, sentence: 'word '.repeat(300) }, storage)
  assert.equal(JSON.parse(storage.map.get(PENDING_KEY) as string).sentence.length, 600)
  storage.setItem(PENDING_KEY, JSON.stringify({ anchor: 'contact', sentence: 'x'.repeat(601), at: NOW }))
  assert.equal(takePending(NOW, storage), null)
})

test('storage that is missing or throws never breaks anything', () => {
  assert.equal(savePending(citation, null), false)
  assert.equal(hasPending(null), false)
  assert.equal(takePending(NOW, null), null)
  const broken: StorageLike = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
    removeItem: () => {
      throw new Error('blocked')
    },
  }
  assert.equal(savePending(citation, broken), false)
  assert.equal(hasPending(broken), false)
  assert.equal(takePending(NOW, broken), null)
})
