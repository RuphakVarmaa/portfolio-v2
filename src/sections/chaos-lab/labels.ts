import { titles } from './titles.ts'

/**
 * Short UI micro-labels for the Chaos Lab and the /experiments/ page: status words for a plate, a column
 * heading, an `aria-label`. Spec prose (the reward lines, the plain captions, the instruction sentence)
 * lives in `src/data/copy.ts` and is imported from there. Nothing here is a result or a claim.
 */
export const labels = {
  cluster: 'CLUSTER',
  operator: 'Operator progress',
  logHeader: 'OPERATOR LOG',
  logLabel: 'Operator log: every line is an event this tab observed',
  logEmpty: 'nothing has happened yet',
  lampsLabel: 'Tabs in this cluster',
  experimentsLabel: 'The three experiments',
  progress: (done: number) => `${done} of 3 experiments done`,
  steps: { plug: 'pull the plug', tab: 'second tab', leader: 'close the leader' },
  titles,
  /** Words on a breaker's status plate. Shape (a lamp, a check, a cross) and text, never colour alone. */
  status: {
    ready: 'READY',
    starting: 'STARTING',
    running: 'RUNNING',
    proved: 'PROVED',
    earlier: 'DONE EARLIER',
    waiting: 'WAITING',
    armed: 'ARMED',
    failed: 'FAILED',
  },
  needsTab: 'Needs a second tab.',
  needsWorkers: 'Needs Web Workers, which this browser does not have.',
  waitingForTab: 'Waiting for the second tab to find this one…',
  thisTab: 'this tab',
  leaderTag: 'LEADER',
  left: 'left',
  wasLeader: 'was LEADER',
  batches: 'Fuzz batches',
  batchWord: 'batch',
  stateWords: {
    queued: 'queued',
    retrying: 'waiting to retry',
    running: 'running',
    done: 'done',
    retried: 'done after a retry',
    failed: 'failed',
  },
  receipts: 'Measured',
  spansTitle: 'Where each batch ran, drawn from the scheduler’s spans',
  tableToggle: 'The same spans as a table',
  table: { job: 'job', node: 'node', attempt: 'attempt', start: 'start (ms)', took: 'took (ms)', outcome: 'outcome' },
} as const
