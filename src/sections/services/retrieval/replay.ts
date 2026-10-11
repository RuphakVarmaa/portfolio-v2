/**
 * "Show me the pipeline" for retrieval: how one real search is replayed on the schematic.
 *
 * A search is five stages the worker timed (`tokenize`, `embed (or BM25)`, `score`, `rerank`, `cite`, see
 * `copy.services.retrieval.pipeline`). The drawing is the production system's, so a stage lights a part only
 * when that part is what stood in for it in this port. This file is the pure half of the replay: given the
 * measured stages it says, step by step, which parts are lit, what small mono text sits under each part, and
 * which stages the panel's list shows so far. The component walks the steps with a short dwell so a person can
 * see them; every number in a step is one the worker measured.
 *
 * Nothing here invents a number, and nothing lights a part that did not run. That has two consequences:
 *   - `agents` (production's LLM agents, which split a question into sub-goals) has no counterpart in this
 *     port. It is never lit and never annotated, so no real time can sit next to a part that did not run.
 *   - `tokenize` really runs (the question is read into words before it meets the index) and is really timed,
 *     but production's drawing has no part for it. It lights nothing; its time is in the stage list.
 *
 * Pure and DOM-free: the panel imports it, and the tests run it under Node.
 */
import type { Stage } from '../../../cluster/protocol.ts'
import type { RetrievalMode, WarmResult } from '../../../lib/retrieval/types.ts'
import { fmtMs } from './format.ts'

/**
 * Which schematic part each pipeline stage lights (the retrieval schematic's own ids, src/data/schematics.ts).
 * An empty list is a stage the production drawing has no part for: it still runs, is still listed with its time,
 * and lights nothing.
 */
export const STAGE_NODES: Readonly<Record<string, readonly string[]>> = {
  tokenize: [],
  'embed (or BM25)': ['pgvector'],
  score: ['pgvector'],
  rerank: ['rerank'],
  cite: ['citations'],
}

/** Index-time parts: the page's text (fetched) and its windows (built into the index). They ran once, at warm-up. */
export const WARM_NODES: readonly string[] = ['ingest', 'chunk']

/**
 * Parts of the production drawing this port does not have: no LLM, so no agents. They stay dark in every step,
 * whatever stage ran, and never get a note, because a real time next to a part that did not run would say that it did.
 * (The policy panel does the same with its JWT, API and indexes.) The panel says so under the timings.
 */
export const PRODUCTION_ONLY: readonly string[] = ['agents']

/** The parts a stage lights; a stage this file does not know lights nothing. */
function nodesOf(stageName: string): readonly string[] {
  return Object.hasOwn(STAGE_NODES, stageName) ? STAGE_NODES[stageName] : []
}

/** Pause on each step of a replay, ms: long enough to read a part light up, short enough to feel like the real thing. */
export const DWELL_MS = 280

/** What the worker measured while it fetched the corpus (the slice of `WarmResult` the replay uses). */
export type WarmFacts = Pick<WarmResult, 'fetchMs'>

export interface ReplayStep {
  /** Parts drawn as running now (the vermilion tint). */
  active: string[]
  /** Small mono text under parts: every measurement up to and including this step. */
  annotations: Record<string, string>
  /** The stages the panel's list shows up to and including this step. */
  stages: Stage[]
}

/** `BM25` or `MiniLM`: which engine did the work under the index part of the drawing. */
export function engineName(mode: RetrievalMode): string {
  return mode === 'embed' ? 'MiniLM' : 'BM25'
}

/**
 * The mono text under each part after `stages` have run. The index part (`pgvector HNSW` in production) shows
 * the name of the engine this port used instead (`BM25` or `MiniLM`), and no time: a part of the drawing is a
 * box two lines tall and about ten characters wide, and the part's own label already takes two of those lines.
 * The times of the stages that ran in it (embed or BM25, score) are in the panel's stage list, one row each.
 */
export function annotate(stages: readonly Stage[], mode: RetrievalMode, warm?: WarmFacts | null): Record<string, string> {
  const out: Record<string, string> = {}
  // The page's text was fetched (ingest); its windows were cut at build time, so no time is shown for `chunk`.
  if (warm) out.ingest = fmtMs(warm.fetchMs)
  const sums = new Map<string, number>()
  for (const stage of stages) {
    for (const node of nodesOf(stage.name)) sums.set(node, (sums.get(node) ?? 0) + stage.ms)
  }
  for (const [node, ms] of sums) out[node] = node === 'pgvector' ? engineName(mode) : fmtMs(ms)
  return out
}

/**
 * The replay as steps: first the two index-time parts (when the warm-up facts are known: they are what the
 * search ran against), then one step per measured stage, cumulatively. A stage that has no part on the drawing
 * (`tokenize`, or a name this file does not know) is a step like the others: the list shows it, no part is lit.
 */
export function planReplay(stages: readonly Stage[], mode: RetrievalMode, warm?: WarmFacts | null): ReplayStep[] {
  const steps: ReplayStep[] = []
  if (warm) steps.push({ active: [...WARM_NODES], annotations: annotate([], mode, warm), stages: [] })
  stages.forEach((stage, index) => {
    const upTo = stages.slice(0, index + 1)
    steps.push({ active: [...nodesOf(stage.name)], annotations: annotate(upTo, mode, warm), stages: [...upTo] })
  })
  return steps
}
