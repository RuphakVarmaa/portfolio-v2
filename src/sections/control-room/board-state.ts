import type { ServiceId } from '../../cluster/protocol.ts'
import { POOL_SIZE, nodeIdFor, serviceOfKind } from '../../cluster/registry.ts'
import type { ClusterState } from '../../cluster/scheduler.ts'
import type { LampId } from './lamp-positions.ts'

/**
 * Small pure helpers between the cluster state and what the board shows. They live outside the React
 * files so `node --test` can pin them, and so the lamps, the cables and the "skip the machine" list all
 * read the state the same way. Plain `.ts`: no JSX, no DOM.
 */

/** One pip per worker node of a service: lit (ready or busy), waiting (spawning), or off (not spawned, or dead). */
export type PipState = 'on' | 'wait' | 'off'

export function pipStates(nodes: ClusterState['nodes'], service: ServiceId): PipState[] {
  return Array.from({ length: POOL_SIZE[service] }, (_, index): PipState => {
    const node = nodes[nodeIdFor(service, index)]
    if (!node) return 'off'
    if (node.status === 'ready' || node.status === 'busy') return 'on'
    return node.status === 'spawning' ? 'wait' : 'off'
  })
}

/** The pips as one comma-joined string (`on,off`), so a store selector can return a primitive and re-render only on change. */
export function pipKey(nodes: ClusterState['nodes'], service: ServiceId): string {
  return pipStates(nodes, service).join(',')
}

export function parsePipKey(key: string): PipState[] {
  return key === '' ? [] : (key.split(',') as PipState[])
}

/**
 * Which half of a two-worker lamp's lens goes dark: `l` when the first worker is down, `r` when the second
 * is, while the other one still serves (the policy pool with `policy-b` unplugged). `null` for a lamp whose
 * workers are all up, all down, or a service with one worker (its lens is simply lit or not).
 */
export function darkHalf(pips: readonly PipState[]): 'l' | 'r' | null {
  if (pips.length !== 2) return null
  const [first, second] = pips
  if (first === 'on' && second !== 'on') return 'r'
  if (second === 'on' && first !== 'on') return 'l'
  return null
}

/**
 * Which cables are "hot": a job of that service is running on a worker right now. Motion jobs (the phone's
 * accelerometer feeding the vision queue) also heat the SENSORS cable. Returned as a sorted, comma-joined
 * string for the same reason as `pipKey`.
 */
export function hotKey(queue: ClusterState['queue']): string {
  const hot = new Set<LampId>()
  for (const job of queue) {
    if (job.node === undefined) continue
    hot.add(serviceOfKind(job.kind))
    if (job.kind === 'vision.motion') hot.add('sensors')
  }
  return [...hot].sort().join(',')
}

export function parseHotKey(key: string): ReadonlySet<LampId> {
  return new Set(key === '' ? [] : (key.split(',') as LampId[]))
}

/** Is any job running on any worker? (The relay's "coil energised" lamp.) */
export function anyJobRunning(queue: ClusterState['queue']): boolean {
  return queue.some((job) => job.node !== undefined)
}

/**
 * `or press 2` -> the words and the key, so the key can be drawn as a keycap. The hint is a sentence in
 * copy.ts; this only separates its last word.
 */
export function splitHint(hint: string): { text: string; key: string } {
  const cut = hint.lastIndexOf(' ')
  return cut < 0 ? { text: '', key: hint } : { text: hint.slice(0, cut), key: hint.slice(cut + 1) }
}

/** `SENSORS` -> `Sensors`: screen readers read an all-caps word letter by letter in some voices. */
export function sentenceCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/**
 * How the message that just passed should move the board. `out` (the scheduler sending to a worker) swings
 * the relay arm one way and pulses the cable from the relay to the lamp; `in` (a worker answering) swings it
 * the other way and pulses the cable lamp to relay. A phone motion sample travels sensor -> relay first.
 */
export interface Throw {
  direction: 'out' | 'in'
  /** Cable pulses to start: which lamp's cable, and which way along it (`out` = relay to lamp). */
  pulses: readonly { lamp: LampId; direction: 'out' | 'in' }[]
}

export function throwFor(direction: 'out' | 'in', service: ServiceId, kind?: string): Throw {
  const pulses: { lamp: LampId; direction: 'out' | 'in' }[] = []
  if (kind === 'vision.motion') pulses.push({ lamp: 'sensors', direction: 'in' })
  pulses.push({ lamp: service, direction })
  return { direction, pulses }
}

/** `120ms` -> 120, `0.4s` -> 400, anything else -> the fallback. Used to read the motion tokens from CSS. */
export function parseDuration(value: string, fallback: number): number {
  const match = /^\s*(-?\d*\.?\d+)\s*(ms|s)\s*$/.exec(value)
  if (!match) return fallback
  return Number(match[1]) * (match[2] === 's' ? 1000 : 1)
}
