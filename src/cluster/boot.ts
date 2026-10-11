import { announce } from './live-region.ts'
import type { ServiceId } from './protocol.ts'
import { quorum, type QuorumState } from './quorum.ts'
import { POOL_SIZE, SERVICE_IDS, SERVICE_LABEL, nodeIdFor } from './registry.ts'
import { scheduler, type ClusterState } from './scheduler.ts'
import { telemetry } from './telemetry.ts'
import { getTier, type Tier } from './tier.ts'
import type { RouteMatch } from '../routes.ts'

/**
 * Starts the cluster once the first render is committed: telemetry, the tab quorum, the first worker
 * pools, and the announcements that belong to the system itself (workers ready, leader changes, a plug
 * pulled and recovered).
 *
 * Which services are spawned eagerly (so their lamps light as their workers post `ready`):
 *   full      home: all four. A project page: only its own service.
 *   standard  home: retrieval, policy, review. Vision stays on standby until its panel asks for it.
 *   basic     none. Services spawn on demand, when a visitor uses a demo.
 *   /resume/ and /experiments/ spawn nothing here.
 * The quorum starts everywhere except /resume/.
 */

let booted = false

/** Pure: the services to spawn at boot for a tier on a route. Exported for tests and the Colophon. */
export function eagerServices(tier: Tier, route: RouteMatch): ServiceId[] {
  if (tier === 'basic') return []
  if (route.kind === 'project') return [route.id]
  if (route.kind !== 'home') return []
  return tier === 'full' ? [...SERVICE_IDS] : SERVICE_IDS.filter((service) => service !== 'vision')
}

/** Announce each pool the first time every one of its workers has posted `ready`. */
function watchReadiness() {
  const announced = new Set<ServiceId>()
  const check = () => {
    const { nodes } = scheduler.getState()
    for (const service of SERVICE_IDS) {
      if (announced.has(service)) continue
      let ready = 0
      for (let index = 0; index < POOL_SIZE[service]; index++) {
        const node = nodes[nodeIdFor(service, index)]
        if (node && node.readyAt !== undefined && node.status !== 'dead') ready += 1
      }
      if (ready === POOL_SIZE[service]) {
        announced.add(service)
        announce(`${SERVICE_LABEL[service]} worker ready.`)
      }
    }
  }
  scheduler.subscribe(check)
  check()
}

/** The scheduler's own sentences (unplugged, retried, recovered, failed) are the ones tapes print; announce them too. */
function watchEvents() {
  let last: ClusterState['lastEvent']
  scheduler.subscribe(() => {
    const event = scheduler.getState().lastEvent
    if (event && event !== last) announce(event)
    last = event
  })
}

/** Announce leadership changes after the first election: a new leader, or none. */
function watchLeadership() {
  let known = false
  let previousLeader: string | null = null
  const describe = (state: QuorumState): string => {
    if (state.leaderId === null) return 'Leader lost. Waiting for an election.'
    if (state.isLeader) return `This tab is now the leader, term ${state.term}.`
    return `${state.leaderId} is now the leader, term ${state.term}.`
  }
  quorum.subscribe(() => {
    const state = quorum.getState()
    if (!known) {
      // The very first election (a lone tab becoming leader at page load) is not news.
      if (state.leaderId !== null) {
        known = true
        previousLeader = state.leaderId
      }
      return
    }
    if (state.leaderId !== previousLeader) {
      previousLeader = state.leaderId
      announce(describe(state))
    }
  })
}

export function bootCluster({ route }: { route: RouteMatch }): void {
  if (booted || typeof window === 'undefined') return
  booted = true

  telemetry.start()
  watchReadiness()
  watchEvents()

  if (route.kind !== 'resume') {
    watchLeadership()
    quorum.start()
  }

  if (!scheduler.isSupported()) return
  for (const service of eagerServices(getTier(), route)) {
    scheduler.ensureService(service).catch(() => {
      /* the lamp stays dark and the demo shows its fallback; nothing else to do */
    })
  }
}
