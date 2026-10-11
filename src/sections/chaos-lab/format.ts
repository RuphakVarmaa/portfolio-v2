import { copy } from '../../data/copy.ts'
import type { PlugRun } from './plug.ts'

/** Number and sentence formatters shared by the reward lines, the operator log and the receipts. Pure. */

/** `7.9` under 10 ms (one decimal), whole milliseconds above: what a reward line prints. */
export function rewardMs(ms: number): number {
  return ms >= 10 ? Math.round(ms) : Math.round(ms * 10) / 10
}

/** `00:12.4`: time since the page loaded, for the operator log (all `performance.now()` based). */
export function logStamp(ms: number): string {
  const total = Math.max(0, ms)
  const minutes = Math.floor(total / 60_000)
  const seconds = Math.floor(total / 1000) % 60
  const tenths = Math.floor((total % 1000) / 100)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(minutes)}:${two(seconds)}.${tenths}`
}

/** Which tone a scheduler sentence deserves on the log. */
export function toneFor(sentence: string): 'ink' | 'live' | 'cobalt' {
  if (/recovered/.test(sentence)) return 'cobalt'
  if (/unplugged|crashed|timed out|failed|did not start|not respawned/.test(sentence)) return 'live'
  return 'ink'
}

const grouped = (n: number) => n.toLocaleString('en-US')

/** Did the retried batch run on the very node that was unplugged (it had already been respawned)? */
export function retriedOnRespawn(run: Pick<PlugRun, 'killed' | 'recovery'>): boolean {
  return run.killed !== null && run.recovery !== null && run.recovery.node === run.killed.node
}

/**
 * The reward sentence of experiment 1 with this run's measured values, or null when the run did not prove
 * anything (it is still going, it failed, it was a plain fuzz, or no batch had to be retried).
 *
 * `copy.chaos.experiments.plug.reward` names the node the job was retried on. Usually that is the sibling,
 * but the scheduler respawns an unplugged node at once, and when the new worker is up before the sibling
 * has finished its own batch, the retry lands on the respawned node. Then the sentence says so, instead of
 * letting the visitor read "policy-b" right after killing policy-b and wonder what happened.
 */
export function plugReward(run: PlugRun): string | null {
  if (run.mode !== 'plug' || run.phase !== 'done' || run.recovery === null) return null
  const { node, retry, ms } = run.recovery
  return copy.chaos.experiments.plug.reward({
    sibling: retriedOnRespawn(run) ? `${node} (the respawned worker)` : node,
    retry,
    ms: rewardMs(ms),
  })
}

/**
 * The mono "receipts" under the plug reward: figures from the run that just finished which the sentence does
 * not already carry. Every number is measured by that run.
 */
export function plugReceipts(run: PlugRun): string {
  const parts: string[] = []
  if (run.killed) {
    const during = run.killed.batch !== null ? ` during batch ${run.killed.batch}` : ''
    const into = run.killed.inFlightMs !== null ? `, ${rewardMs(run.killed.inFlightMs)} ms after it was dispatched` : ''
    parts.push(`unplugged ${run.killed.node}${during}${into}`)
  }
  if (run.killed && run.respawnMs !== null) parts.push(`${run.killed.node} back in ${Math.round(run.respawnMs)} ms`)
  if (run.totals) parts.push(`${grouped(run.totals.evaluated)} evaluations, ${run.totals.leaks} cross-tenant leaks`)
  return parts.join(' · ')
}

/** A run of text, and whether it names a node (a worker or a tab), so it can be set in mono on one line. */
export interface NodeSegment {
  text: string
  node: boolean
}

const NODE_ID = /\b(?:tab-[0-9a-f]{2,8}|(?:retrieval|vision|policy|review)-[a-h])\b/g

/**
 * Split a sentence around the node ids it mentions (`policy-b`, `tab-4a8c`). A hyphenated id would otherwise
 * break across two lines ("tab-" / "4a8c"), which reads as two different words.
 */
export function splitNodeIds(text: string): NodeSegment[] {
  const out: NodeSegment[] = []
  let at = 0
  for (const match of text.matchAll(NODE_ID)) {
    if (match.index > at) out.push({ text: text.slice(at, match.index), node: false })
    out.push({ text: match[0], node: true })
    at = match.index + match[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at), node: false })
  return out
}
