import { announce } from '../../cluster/live-region.ts'
import { scheduler } from '../../cluster/scheduler.ts'
import { getChaos } from './chaos.ts'
import { FUZZ_PER_BATCH, nextBatchScale, runPlug, singleFlight, type PlugRun } from './plug.ts'

/**
 * The batch-size multiplier for this page. It starts at 1 and only grows when a run proves this machine is
 * too quick to be cut mid-batch at the default size (see `nextBatchScale`), so "Run it again" is honest advice.
 */
let batchScale = 1

async function run(mode: 'plug' | 'fuzz'): Promise<PlugRun> {
  const chaos = getChaos()
  const result = await runPlug(
    {
      scheduler,
      now: () => performance.now(),
      random: () => Math.random(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
    { update: (next) => chaos.setPlug(next), log: (text, tone) => chaos.log(text, tone) },
    { mode, perBatch: FUZZ_PER_BATCH * batchScale },
  )
  batchScale = nextBatchScale(batchScale, result)
  if (result.phase === 'error' && result.error) announce(result.error)
  return result
}

/**
 * Run the real fuzz on the real scheduler (and, in `plug` mode, pull the plug on policy-b mid-batch),
 * reporting every phase into the page's Chaos Lab store. Used by the lab's first breaker and by the trace
 * viewer on /experiments/. A run that could not prove anything ends with its honest sentence, announced.
 * One run at a time: asking while one is in flight joins it (see `singleFlight`).
 */
export const startFuzz = singleFlight(run)
