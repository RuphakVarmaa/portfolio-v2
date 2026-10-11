import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Stage } from '../../../cluster/protocol.ts'
import { copy } from '../../../data/copy.ts'
import { getSchematic } from '../../../data/schematics.ts'
import { DWELL_MS, STAGE_NODES, WARM_NODES, annotate, engineName, planReplay } from './replay.ts'

const stages: Stage[] = [
  { name: 'tokenize', ms: 0.1 },
  { name: 'embed (or BM25)', ms: 0.02 },
  { name: 'score', ms: 0.04 },
  { name: 'rerank', ms: 12.4 },
  { name: 'cite', ms: 3.7 },
]
const warm = { fetchMs: 14.2 }

test('every stage of the pipeline lights a part that exists on the retrieval schematic', () => {
  const ids = new Set(getSchematic('retrieval').nodes.map((node) => node.id))
  for (const name of copy.services.retrieval.pipeline) {
    const nodes = STAGE_NODES[name]
    assert.ok(nodes && nodes.length > 0, `stage "${name}" lights nothing`)
    for (const node of nodes) assert.ok(ids.has(node), `stage "${name}" lights "${node}", which is not on the drawing`)
  }
  for (const node of WARM_NODES) assert.ok(ids.has(node), `index-time part "${node}" is not on the drawing`)
})

test('a replay is the two index-time parts first, then one step per stage, cumulative', () => {
  const steps = planReplay(stages, 'bm25', warm)
  assert.equal(steps.length, stages.length + 1)
  assert.deepEqual(steps[0].active, ['ingest', 'chunk'])
  assert.deepEqual(steps[0].stages, [])
  steps.slice(1).forEach((step, index) => {
    assert.deepEqual(step.stages, stages.slice(0, index + 1))
    assert.deepEqual(step.active, [...STAGE_NODES[stages[index].name]])
  })
  assert.deepEqual(steps.at(-1)?.stages, stages)
})

test('without warm-up facts there are no index-time steps and no ingest or chunk text', () => {
  const steps = planReplay(stages, 'bm25', null)
  assert.equal(steps.length, stages.length)
  for (const step of steps) assert.ok(!('ingest' in step.annotations) && !('chunk' in step.annotations))
})

test('annotations are measured values only; the index part names the engine that stood in for pgvector', () => {
  const bm = annotate(stages, 'bm25', warm)
  assert.equal(bm.ingest, '14 ms')
  assert.ok(!('chunk' in bm), 'the windows were cut at build time: nothing was measured for them here')
  assert.equal(bm.agents, '0.1 ms')
  assert.equal(bm.pgvector, 'BM25') // a name, no time: the part is too small for both, and the stage list has the times
  assert.equal(bm.rerank, '12 ms')
  assert.equal(bm.citations, '3.7 ms')
  assert.equal(annotate(stages, 'embed', warm).pgvector, 'MiniLM')
  assert.ok(!('pgvector' in annotate([stages[0]], 'bm25', warm)), 'the part has no note until one of its stages has run')
  // Parts nobody measured stay out.
  assert.deepEqual(Object.keys(annotate([], 'bm25', null)), [])
  assert.deepEqual(Object.keys(annotate([stages[0]], 'bm25', null)), ['agents'])
})

test('an unknown stage name is listed but lights and annotates nothing', () => {
  const steps = planReplay([{ name: 'constructor', ms: 1 }, { name: 'warp', ms: 2 }], 'bm25', null)
  assert.equal(steps.length, 2)
  for (const step of steps) {
    assert.deepEqual(step.active, [])
    assert.deepEqual(step.annotations, {})
  }
  assert.equal(steps[1].stages.length, 2)
})

test('engineName and the dwell', () => {
  assert.equal(engineName('bm25'), 'BM25')
  assert.equal(engineName('embed'), 'MiniLM')
  assert.ok(DWELL_MS >= 120 && DWELL_MS <= 600, 'long enough to see, short enough to feel real')
})
