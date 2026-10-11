import type { ServiceId } from './protocol.ts'
import { POOL_SIZE, nodeIdFor, serviceOfKind } from './registry.ts'
import type { ClusterState } from './scheduler.ts'

/**
 * One word for the state of a whole service, so the board lamps, the chaos lab and the "skip the machine"
 * list all mean the same thing by "ready".
 *
 *   standby   no worker of this service has been spawned yet (the vision worker on the standard tier)
 *   starting  spawned, none ready yet
 *   ready     every node of the pool is ready and idle
 *   busy      every node is up and at least one is running a job
 *   degraded  some nodes are up, some are not (policy-b unplugged while policy-a still works)
 *   down      spawned, but no node is up and none is starting (never started, or every node is dead)
 */
export type ServicePhase = 'standby' | 'starting' | 'ready' | 'busy' | 'degraded' | 'down'

export function servicePhase(state: Pick<ClusterState, 'nodes'>, service: ServiceId): ServicePhase {
  const records = Array.from({ length: POOL_SIZE[service] }, (_, index) => state.nodes[nodeIdFor(service, index)]).filter(
    (record) => record !== undefined,
  )
  if (records.length === 0) return 'standby'
  const up = records.filter((record) => record.status === 'ready' || record.status === 'busy')
  if (up.length === POOL_SIZE[service]) return up.some((record) => record.status === 'busy') ? 'busy' : 'ready'
  if (up.length > 0) return 'degraded'
  if (records.some((record) => record.status === 'spawning')) return 'starting'
  return 'down'
}

/** A lit lamp: the service can do work (ready, busy, or degraded but still serving). */
export function isLit(phase: ServicePhase): boolean {
  return phase === 'ready' || phase === 'busy' || phase === 'degraded'
}

/** Jobs of this service running on a worker right now (what makes a cable "hot"). */
export function jobsInFlight(state: Pick<ClusterState, 'queue'>, service: ServiceId): number {
  return state.queue.filter((job) => job.node !== undefined && serviceOfKind(job.kind) === service).length
}
