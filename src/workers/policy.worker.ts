// PLACEHOLDER from F (foundation). Owned by S4 after F merges: replace the empty handler map.
//
// This one script backs BOTH nodes of the policy pool (policy-a, policy-b): the scheduler names each
// Worker instance, `defineWorker` reads `self.name`. Handlers to implement:
//   'policy.evaluate' -> run one request through the pure engine -> { allow, policy, audit, us }
//   'policy.fuzz'     -> run `n` seeded evaluations                -> { evaluated, leaks, p95us, totalMs, sample }
import { defineWorker } from './_base.ts'

defineWorker('policy-a', {})
