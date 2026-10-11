import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COCO_CLASSES } from './coco-classes.ts'
import { ASSET_PATHS, loadAvailability, parseMetadata, readBuildAssets } from './availability.ts'

const meta = { inputSize: 320, bytes: 3_500_000, sha256: 'abc', quant: 'int8', classes: ['person', 'cup'] }

const buildInfo = (present: Record<string, boolean>, bytes: Record<string, number> = {}) => ({
  assets: Object.values(ASSET_PATHS).map((path) => ({ path, label: path, bytes: bytes[path] ?? 0, present: present[path] === true })),
})

/** A fetch that serves a fixed table and records every path it was asked for. */
function fakeFetch(table: Record<string, unknown>) {
  const asked: string[] = []
  return {
    asked,
    fetchJson: async (path: string) => {
      asked.push(path)
      return path in table ? table[path] : null
    },
  }
}

test('nothing published: the build says so and no file is requested besides build-info.json', async () => {
  const f = fakeFetch({ 'build-info.json': buildInfo({ [ASSET_PATHS.wasm]: true }, { [ASSET_PATHS.wasm]: 14_239_897 }) })
  const result = await loadAvailability({ fetchJson: f.fetchJson, probeDirectly: false })
  assert.deepEqual(result, { detector: null, runtimeBytes: 14_239_897, trace: false, clip: false })
  assert.deepEqual(f.asked, ['build-info.json'], 'a missing file is never requested, so the console stays clean')
})

test('the detector is published: its metadata is fetched and validated', async () => {
  const f = fakeFetch({ 'build-info.json': buildInfo({ [ASSET_PATHS.model]: true, [ASSET_PATHS.wasm]: true }, { [ASSET_PATHS.wasm]: 14_239_897 }), [ASSET_PATHS.metadata]: meta })
  const result = await loadAvailability({ fetchJson: f.fetchJson, probeDirectly: false })
  assert.equal(result.detector?.quant, 'int8')
  assert.equal(result.detector?.bytes, 3_500_000)
  assert.deepEqual(result.detector?.classes, ['person', 'cup'])
  assert.equal(result.runtimeBytes, 14_239_897)
  assert.deepEqual(f.asked, ['build-info.json', ASSET_PATHS.metadata])
})

test('a published model with unusable metadata is treated as not published (and the panel says why elsewhere)', async () => {
  const f = fakeFetch({ 'build-info.json': buildInfo({ [ASSET_PATHS.model]: true }), [ASSET_PATHS.metadata]: { inputSize: 640 } })
  assert.equal((await loadAvailability({ fetchJson: f.fetchJson, probeDirectly: false })).detector, null)
})

test('a trace and a clip are reported from the inventory', async () => {
  const f = fakeFetch({ 'build-info.json': buildInfo({ [ASSET_PATHS.trace]: true, [ASSET_PATHS.clip]: true }) })
  const result = await loadAvailability({ fetchJson: f.fetchJson, probeDirectly: false })
  assert.equal(result.trace, true)
  assert.equal(result.clip, true)
})

test('no build-info.json on a production build means nothing is probed and nothing is claimed', async () => {
  const f = fakeFetch({})
  const result = await loadAvailability({ fetchJson: f.fetchJson, probeDirectly: false })
  assert.deepEqual(result, { detector: null, runtimeBytes: null, trace: false, clip: false })
  assert.deepEqual(f.asked, ['build-info.json'])
})

test('the dev server has no build-info.json, so files are probed directly', async () => {
  const f = fakeFetch({ [ASSET_PATHS.metadata]: meta, [ASSET_PATHS.trace]: { device: 'x' } })
  const result = await loadAvailability({
    fetchJson: f.fetchJson,
    probeDirectly: true,
    exists: async (path) => path === ASSET_PATHS.clip,
    size: async (path) => (path === ASSET_PATHS.wasm ? 14_239_897 : null),
  })
  assert.equal(result.detector?.quant, 'int8')
  assert.equal(result.trace, true)
  assert.equal(result.clip, true)
  assert.equal(result.runtimeBytes, 14_239_897, 'the runtime size comes from its headers when there is no build-info')
})

test('build-info with no assets list is not a build-info file', () => {
  assert.equal(readBuildAssets(null), null)
  assert.equal(readBuildAssets({}), null)
  assert.equal(readBuildAssets({ assets: 'x' }), null)
  const map = readBuildAssets({ assets: [{ path: 'a', bytes: 5, present: true }, null, { bytes: 1 }, { path: 'b', present: false }] })
  assert.deepEqual([...(map?.keys() ?? [])], ['a', 'b'])
  assert.equal(map?.get('b')?.bytes, 0)
})

test('metadata must describe the 320 px export; classes default to the 80 COCO names', () => {
  assert.equal(parseMetadata(meta)?.inputSize, 320)
  assert.equal(parseMetadata({ ...meta, inputSize: 640 }), null)
  assert.equal(parseMetadata({ ...meta, bytes: 0 }), null)
  assert.equal(parseMetadata({ ...meta, bytes: '3.5 MB' }), null)
  assert.equal(parseMetadata({ ...meta, quant: '' }), null)
  assert.equal(parseMetadata({ ...meta, sha256: 5 }), null)
  assert.equal(parseMetadata({ ...meta, classes: [1, 2] }), null)
  assert.equal(parseMetadata({ ...meta, classes: [] }), null)
  assert.deepEqual(parseMetadata({ inputSize: 320, bytes: 10, quant: 'fp16' })?.classes, COCO_CLASSES)
  assert.equal(parseMetadata(null), null)
  assert.equal(parseMetadata([]), null)
  assert.equal(parseMetadata('x'), null)
})
