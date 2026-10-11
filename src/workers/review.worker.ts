// PLACEHOLDER from F (foundation). Owned by S4 after F merges: replace the empty handler map.
//
// Handler to implement (src/cluster/protocol.ts):
//   'review.analyze' -> pattern rules + acorn AST pass + tiering -> { findings, stages, parsed }
// Import `acorn` here (worker bundle), never in the main-thread entry chunk.
import { defineWorker } from './_base.ts'

defineWorker('review-a', {})
