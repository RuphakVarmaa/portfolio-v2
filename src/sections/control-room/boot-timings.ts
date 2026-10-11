import type { NodeId } from '../../cluster/protocol.ts'
import type { TelemetrySnapshot, WorkerTiming } from '../../cluster/telemetry.ts'

/**
 * The boot line is a log of the visitor's boot (spec 3.2, signature moment 2: "the boot log that is true"), so
 * each service's "up N ms" is the moment its workers first said `ready` and never changes afterwards.
 *
 * Telemetry holds the *current* timing of each node, and a respawn overwrites it: "Pull the plug" on policy-b
 * terminates it, the scheduler spawns the same node id again, and its `readyAt` becomes the respawn's time
 * (36,380 ms since navigation in the review that found this). The line then read `policy up 36380 ms`. Here the
 * first spawn and the first `ready` of every node are kept apart from that, and the boot line is built from them.
 * What the respawn did is shown where it belongs: on the chaos lab's tape and in the footer strip.
 *
 * Plain `.ts` on purpose (no JSX, no DOM): `node --test` imports it directly.
 */

type Workers = TelemetrySnapshot['workers']

/** The boot-time timing (first spawn, first ready) of every worker that has come up so far. */
export type FirstReady = Readonly<Record<NodeId, WorkerTiming>>

export const NO_FIRST_READY: FirstReady = Object.freeze({})

/**
 * Add every node that has just come up for the first time to what is already remembered. Returns `known` itself
 * when there is nothing new (so a caller can tell by identity, and a store selector does not re-render); a node
 * that is remembered is never changed again, however often it is respawned.
 */
export function rememberFirstReady(known: FirstReady, live: Workers): FirstReady {
  let next: Record<NodeId, WorkerTiming> | null = null
  for (const [node, timing] of Object.entries(live)) {
    if (known[node] !== undefined) continue
    if (timing.spawnAt === null || timing.readyAt === null) continue
    next ??= { ...known }
    next[node] = timing
  }
  return next ?? known
}

/**
 * The timings the boot line is built from: the remembered first-ready pair for every node that has been up, the
 * live timing for the rest (a node that is still spawning for the first time reads `starting`, one that was never
 * spawned reads `standby`).
 */
export function bootTimings(known: FirstReady, live: Workers): Workers {
  return Object.keys(known).length === 0 ? live : { ...live, ...known }
}
