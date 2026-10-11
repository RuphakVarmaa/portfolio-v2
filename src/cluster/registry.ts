import type { JobKind, NodeId, ServiceId } from './protocol.ts'

/**
 * The cluster's static topology: which services exist, how many worker nodes each runs, and the four
 * fixed `new URL` worker paths. Vite only emits a worker as an on-origin module file when it sees the
 * literal `new Worker(new URL('...', import.meta.url), { type: 'module', ... })` form, so every node
 * has its own spelled-out factory below (no loops, no variables in the options object).
 */

export const SERVICE_IDS: readonly ServiceId[] = ['retrieval', 'vision', 'policy', 'review']

/** Number of worker nodes per service. Spec 6.5: policy runs a pool of two (policy-a, policy-b), the rest one. */
export const POOL_SIZE: Readonly<Record<ServiceId, number>> = {
  retrieval: 1,
  vision: 1,
  policy: 2,
  review: 1,
}

/**
 * How many jobs one node may hold in flight at once. Policy and review are CPU-bound and strictly
 * serial (one job per node is what makes "batch 7 was running on policy-b" true). Retrieval allows a
 * BM25 search to be answered while the model download (async fetch) is in flight; vision allows the
 * motion producer to enqueue next to a running detection.
 */
export const CONCURRENCY: Readonly<Record<ServiceId, number>> = {
  retrieval: 4,
  vision: 2,
  policy: 1,
  review: 1,
}

export const SERVICE_LABEL: Readonly<Record<ServiceId, string>> = {
  retrieval: 'Retrieval',
  vision: 'Vision',
  policy: 'Policy',
  review: 'Review',
}

const LETTERS = 'abcdefgh'

/** `nodeIdFor('policy', 1)` -> `'policy-b'`. */
export function nodeIdFor(service: ServiceId, index: number): NodeId {
  return `${service}-${LETTERS[index] ?? String(index)}`
}

/** Inverse of `nodeIdFor`. Returns null for ids that are not worker nodes (e.g. tab ids). */
export function parseNodeId(node: NodeId): { service: ServiceId; index: number } | null {
  const dash = node.lastIndexOf('-')
  if (dash < 0) return null
  const service = node.slice(0, dash) as ServiceId
  if (!SERVICE_IDS.includes(service)) return null
  const index = LETTERS.indexOf(node.slice(dash + 1))
  if (index < 0 || index >= POOL_SIZE[service]) return null
  return { service, index }
}

/** `'policy.fuzz'` -> `'policy'`. */
export function serviceOfKind(kind: JobKind): ServiceId {
  return kind.slice(0, kind.indexOf('.')) as ServiceId
}

/** Every node id in the cluster, in pool order: retrieval-a, vision-a, policy-a, policy-b, review-a. */
export function allNodeIds(): NodeId[] {
  return SERVICE_IDS.flatMap((service) =>
    Array.from({ length: POOL_SIZE[service] }, (_, index) => nodeIdFor(service, index)),
  )
}

export type WorkerFactory = () => Worker

/**
 * One factory per node. The `name` option is the NodeId: it shows up in DevTools and becomes
 * `self.name` inside the worker, which is how `defineWorker` knows whether it is policy-a or policy-b.
 */
export const WORKER_FACTORIES: Readonly<Record<NodeId, WorkerFactory>> = {
  'retrieval-a': () =>
    new Worker(new URL('../workers/retrieval.worker.ts', import.meta.url), { type: 'module', name: 'retrieval-a' }),
  'vision-a': () =>
    new Worker(new URL('../workers/vision.worker.ts', import.meta.url), { type: 'module', name: 'vision-a' }),
  'policy-a': () =>
    new Worker(new URL('../workers/policy.worker.ts', import.meta.url), { type: 'module', name: 'policy-a' }),
  'policy-b': () =>
    new Worker(new URL('../workers/policy.worker.ts', import.meta.url), { type: 'module', name: 'policy-b' }),
  'review-a': () =>
    new Worker(new URL('../workers/review.worker.ts', import.meta.url), { type: 'module', name: 'review-a' }),
}

/** Create the raw Worker for a node. Throws if the node is not part of the topology. */
export function createRawWorker(node: NodeId): Worker {
  const factory = WORKER_FACTORIES[node]
  if (!factory) throw new Error(`No worker factory registered for node "${node}"`)
  return factory()
}
