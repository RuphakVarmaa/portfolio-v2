import type { ServiceId } from './protocol.ts'
import { POOL_SIZE, nodeIdFor } from './registry.ts'
import type { TelemetrySnapshot } from './telemetry.ts'

/**
 * The hero's boot line, built only from measured values (spec 3.2):
 *
 *   FCP 412 ms · retrieval up 530 ms · policy up 544 ms · review up 561 ms · vision standby · 1 node · term 1
 *
 * and, once every service that was started is up, the closing clause
 *
 *   ... · no backend was harmed; this trace is yours.
 *
 * "up N ms" is when the service's whole pool had posted `ready`, in ms since navigation start, the same
 * clock as FCP. A service that was never spawned is `standby`; one that was spawned but is not ready
 * is `starting`. Nothing here is a constant except the words.
 */
export const BOOT_LINE_PRERENDERED = 'booting ruphak.me v3 · node 1 of 1'
export const BOOT_LINE_CLOSING = 'no backend was harmed; this trace is yours.'

export interface BootLineInput {
  fcp: TelemetrySnapshot['fcp']
  workers: TelemetrySnapshot['workers']
  /** Live tabs in the quorum (QuorumState.nodes). */
  nodes: number
  /** QuorumState.term; 0 or less means "no election yet" and the term clause is dropped. */
  term: number
}

/** Reading order used for services that are not up yet (matches the spec's example line). */
const DISPLAY_ORDER: readonly ServiceId[] = ['retrieval', 'policy', 'review', 'vision']

type ServiceStatus = { kind: 'up'; at: number } | { kind: 'starting' } | { kind: 'standby' }

function serviceStatus(service: ServiceId, workers: BootLineInput['workers']): ServiceStatus {
  let spawned = 0
  let ready = 0
  let latest = 0
  for (let index = 0; index < POOL_SIZE[service]; index++) {
    const timing = workers[nodeIdFor(service, index)]
    if (!timing || timing.spawnAt === null) continue
    spawned += 1
    if (timing.readyAt !== null) {
      ready += 1
      latest = Math.max(latest, timing.readyAt)
    }
  }
  if (spawned === 0) return { kind: 'standby' }
  if (ready === POOL_SIZE[service]) return { kind: 'up', at: latest }
  return { kind: 'starting' }
}

export function buildBootLine(input: BootLineInput): string {
  const parts: string[] = []
  if (input.fcp !== null) parts.push(`FCP ${Math.round(input.fcp)} ms`)

  const statuses = DISPLAY_ORDER.map((service) => ({ service, status: serviceStatus(service, input.workers) }))
  const up = statuses
    .filter((s): s is { service: ServiceId; status: { kind: 'up'; at: number } } => s.status.kind === 'up')
    .sort((a, b) => a.status.at - b.status.at)
  for (const entry of up) parts.push(`${entry.service} up ${Math.round(entry.status.at)} ms`)
  for (const entry of statuses) {
    if (entry.status.kind === 'starting') parts.push(`${entry.service} starting`)
  }
  for (const entry of statuses) {
    if (entry.status.kind === 'standby') parts.push(`${entry.service} standby`)
  }

  parts.push(`${input.nodes} node${input.nodes === 1 ? '' : 's'}`)
  if (input.term > 0) parts.push(`term ${input.term}`)

  const anyStarting = statuses.some((s) => s.status.kind === 'starting')
  if (up.length > 0 && !anyStarting) parts.push(BOOT_LINE_CLOSING)
  return parts.join(' · ')
}
