/**
 * QUORUM cluster protocol. Frozen by the build spec (section 6.5): sections consume these types and
 * never edit them. This file is types only, so it is erased entirely under Node type stripping.
 */

export type ServiceId = 'retrieval' | 'vision' | 'policy' | 'review'
export type NodeId = string // `${service}-${letter}` e.g. 'policy-b'

export type JobKind =
  | 'retrieval.warm' | 'retrieval.search' | 'retrieval.loadModel'
  | 'vision.warm' | 'vision.loadModel' | 'vision.detect' | 'vision.motion'
  | 'policy.evaluate' | 'policy.fuzz'
  | 'review.analyze'

export interface JobPayload {
  'retrieval.warm': { corpusUrl: string }
  'retrieval.search': { query: string; mode: 'bm25' | 'embed'; topK: number }
  'retrieval.loadModel': { modelUrl: string; wasmBase: string; embeddingsUrl?: string }
  'vision.warm': Record<string, never>
  'vision.loadModel': { modelUrl: string; wasmBase: string; inputSize: 320 }
  'vision.detect': { bitmap: ImageBitmap; ts: number }
  'vision.motion': { ax: number; ay: number; az: number; ts: number }
  'policy.evaluate': { tenant: string; actorTenant: string; role: Role; resource: Resource; action: Action; resourceTenant: string }
  'policy.fuzz': { n: number; seed: number; batch: number }
  'review.analyze': { source: string; filename: string }
}
export interface JobResult {
  'retrieval.warm': { chunks: number; terms: number }
  'retrieval.search': { hits: Hit[]; stages: Stage[] }
  'retrieval.loadModel': { bytes: number; dim: number; chunksEmbedded: number }
  'vision.warm': { ok: true }
  'vision.loadModel': { bytes: number }
  'vision.detect': { boxes: Box[]; inferMs: number; ts: number }
  'vision.motion': { ts: number }
  'policy.evaluate': { allow: boolean; policy: string; audit: string; us: number }
  'policy.fuzz': { evaluated: number; leaks: number; p95us: number; totalMs: number; sample: string[] }
  'review.analyze': { findings: Finding[]; stages: Stage[]; parsed: boolean }
}
export type Role = 'owner' | 'admin' | 'member' | 'viewer'
export type Resource = 'project' | 'task' | 'audit-log' | 'billing'
export type Action = 'read' | 'write' | 'delete' | 'share'
export interface Stage { name: string; ms: number }
export interface Hit { chunkId: string; anchor: string; text: string; bm25: number; cosine?: number; window: { start: number; end: number } }
export interface Box { x: number; y: number; w: number; h: number; cls: string; conf: number }
export interface Finding { ruleId: string; tier: 1 | 2 | 3 | 4 | 5; line: number; endLine?: number; message: string; fix: string; stage: 'pattern' | 'ast' }

export type ToWorker =
  | { type: 'job'; id: string; kind: JobKind; payload: unknown }
  | { type: 'cancel'; id: string }
  | { type: 'ping'; at: number }
export type FromWorker =
  | { type: 'ready'; node: NodeId; at: number }
  | { type: 'progress'; id: string; stage?: string; pct?: number; bytesLoaded?: number; bytesTotal?: number }
  | { type: 'result'; id: string; result: unknown }
  | { type: 'error'; id: string; message: string; retryable: boolean }
  | { type: 'log'; level: 'info' | 'warn'; text: string }
  | { type: 'pong'; at: number }
