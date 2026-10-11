import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyText } from './clipboard.ts'

test('uses the async Clipboard API when it is there and reports success', async () => {
  const written: string[] = []
  const ok = await copyText('ruphakv@gmail.com', { clipboard: { writeText: async (text) => void written.push(text) } })
  assert.equal(ok, true)
  assert.deepEqual(written, ['ruphakv@gmail.com'])
})

test('a refused write falls through to the legacy path, which reports false where there is no document', async () => {
  const ok = await copyText('x', { clipboard: { writeText: async () => { throw new Error('NotAllowedError') } } })
  assert.equal(ok, false)
})

test('no clipboard at all reports false instead of throwing', async () => {
  assert.equal(await copyText('x', { clipboard: null }), false)
})
