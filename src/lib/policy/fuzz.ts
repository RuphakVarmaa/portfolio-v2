import type { JobPayload, Stage } from '../../cluster/protocol.ts'
import { hashString } from '../draw/wobble.ts'
import { DENY_RLS, applyRules, auditLine, checkTenant, isLeak, type Decision, type PolicyRequest } from './engine.ts'
import { ACTIONS, RESOURCES, ROLES, TENANTS } from './rulebook.ts'

/**
 * The cross-tenant fuzz (spec 4.5, 6.8). One batch is `n` seeded requests, about half of them reaching
 * across tenants, pushed through the three pipeline stages as three passes over the batch:
 *
 *   verify    rule 0, the row-level tenant check, for every request
 *   evaluate  the rule and role checks (a request that failed verify is denied by rule 0), counting leaks
 *   audit     the audit line for every request: formatted, then encoded to UTF-8 into a log buffer, the way a
 *             log writer would (all of them are written; a few are kept as a sample)
 *
 * Pure apart from the injected clocks. The same `(seed, batch)` always generates the same requests, so a
 * batch that is re-run after a worker was unplugged reproduces the first attempt exactly: retrying is safe.
 */

export type FuzzInput = JobPayload['policy.fuzz']

export const STAGE_NAMES = ['verify', 'evaluate', 'audit'] as const

/** The protocol's `policy.fuzz` result plus the measurements the panel shows. Extra fields are additive. */
export interface BatchResult {
  evaluated: number
  leaks: number
  /** p95 of the per-evaluation time in microseconds, from ten timed slices of the evaluate pass. */
  p95us: number
  /** Wall time of the whole batch in the worker, milliseconds. */
  totalMs: number
  /** A few real audit lines from this batch: the first leak if there was one, then the first cross-tenant request, allow and same-tenant refusal. */
  sample: string[]
  /** Requests whose actor and row are in different tenants. */
  crossTenant: number
  allowed: number
  denied: number
  /** UTF-8 bytes of audit text written for the batch (every request gets a line). */
  auditBytes: number
  /** Measured time of each pass, milliseconds, in pipeline order. */
  stages: Stage[]
  /** The worker that ran it (`policy-a`); set by the worker. */
  node?: string
}

export interface FuzzCase {
  request: PolicyRequest
  /** The row number in the resource id, `A-417`. */
  row: number
  serial: number
}

/** xorshift32: tiny, fast, and the same sequence in every engine. Returns unsigned 32-bit integers. */
export function xorshift32(seed: number): () => number {
  let x = (seed | 0) || 0x1b873593
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return x >>> 0
  }
}

/** The generator seed of one batch: stable for `(seed, batch)`, independent of which worker runs it. */
export function batchSeed(seed: number, batch: number): number {
  return hashString(`fuzz:${seed}:${batch}`) || 0x9e3779b9
}

const pick = (next: () => number, n: number): number => Math.floor((next() / 4294967296) * n)

/**
 * One request. Always draws the same seven numbers, so the sequence never depends on which branch a case
 * takes. Half the cases (a fair coin) ask a tenant for another tenant's row.
 */
export function makeCase(next: () => number, serial: number): FuzzCase {
  const actor = pick(next, TENANTS.length)
  const cross = next() >>> 31 === 1
  const offset = pick(next, TENANTS.length - 1)
  const role = ROLES[pick(next, ROLES.length)]
  const resource = RESOURCES[pick(next, RESOURCES.length)]
  const action = ACTIONS[pick(next, ACTIONS.length)]
  const row = 100 + pick(next, 900)
  const actorTenant = TENANTS[actor]
  const resourceTenant = cross ? TENANTS[(actor + 1 + offset) % TENANTS.length] : actorTenant
  return { request: { tenant: actorTenant, actorTenant, role, resource, action, resourceTenant }, row, serial }
}

/** Nearest-rank percentile (`p` in 0..100). 0 for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]
}

const round3 = (n: number) => Math.round(n * 1000) / 1000
const round1 = (n: number) => Math.round(n * 10) / 10

export interface BatchDeps {
  /** Rule 0. Replaceable so a test can prove the leak counter notices a broken engine. */
  verify: (request: PolicyRequest) => boolean
  /** The rule and role checks. */
  rules: (request: PolicyRequest) => Decision
  /** High-resolution milliseconds (`performance.now`). */
  clock: () => number
  /** Epoch milliseconds for audit timestamps. */
  wall: () => number
}

export const DEFAULT_DEPS: BatchDeps = {
  verify: checkTenant,
  rules: applyRules,
  clock: () => performance.now(),
  wall: () => Date.now(),
}

/** Run one batch. See the file comment for the three passes. */
export function runBatch(input: FuzzInput, overrides: Partial<BatchDeps> = {}): BatchResult {
  const deps: BatchDeps = { ...DEFAULT_DEPS, ...overrides }
  const n = Math.max(0, Math.floor(input.n))
  const started = deps.clock()

  const next = xorshift32(batchSeed(input.seed, input.batch))
  const cases: FuzzCase[] = new Array<FuzzCase>(n)
  for (let i = 0; i < n; i++) cases[i] = makeCase(next, i)

  // verify
  const verifyStart = deps.clock()
  const sameTenant = new Uint8Array(n)
  for (let i = 0; i < n; i++) sameTenant[i] = deps.verify(cases[i].request) ? 1 : 0

  // evaluate, in ten timed slices so the batch has a latency distribution (p95)
  const evaluateStart = deps.clock()
  const decisions: Decision[] = new Array<Decision>(n)
  let leaks = 0
  let crossTenant = 0
  let allowed = 0
  const perEvaluationMicros: number[] = []
  const slice = Math.max(1, Math.ceil(n / 10))
  for (let from = 0; from < n; from += slice) {
    const to = Math.min(n, from + slice)
    const sliceStart = deps.clock()
    for (let i = from; i < to; i++) {
      const request = cases[i].request
      const decision = sameTenant[i] === 1 ? deps.rules(request) : DENY_RLS
      decisions[i] = decision
      if (request.actorTenant !== request.resourceTenant) crossTenant += 1
      if (decision.allow) allowed += 1
      if (isLeak(request, decision)) leaks += 1
    }
    perEvaluationMicros.push(((deps.clock() - sliceStart) * 1000) / (to - from))
  }

  // audit
  const auditStart = deps.clock()
  let leakLine: string | undefined
  let crossLine: string | undefined
  let allowLine: string | undefined
  let denyLine: string | undefined
  let auditBytes = 0
  const log = new Uint8Array(512)
  const encoder = new TextEncoder()
  for (let i = 0; i < n; i++) {
    const { request, row, serial } = cases[i]
    const decision = decisions[i]
    const line = auditLine(request, decision, deps.wall(), row, serial)
    auditBytes += encoder.encodeInto(line, log).written
    if (isLeak(request, decision)) leakLine ??= line
    if (request.actorTenant !== request.resourceTenant) crossLine ??= line
    else if (decision.allow) allowLine ??= line
    else denyLine ??= line
  }
  const finished = deps.clock()

  return {
    evaluated: n,
    leaks,
    p95us: round1(percentile(perEvaluationMicros, 95)),
    totalMs: round3(finished - started),
    sample: [leakLine, crossLine, allowLine, denyLine].filter((line): line is string => line !== undefined),
    crossTenant,
    allowed,
    denied: n - allowed,
    auditBytes,
    stages: [
      { name: STAGE_NAMES[0], ms: round3(evaluateStart - verifyStart) },
      { name: STAGE_NAMES[1], ms: round3(auditStart - evaluateStart) },
      { name: STAGE_NAMES[2], ms: round3(finished - auditStart) },
    ],
  }
}
