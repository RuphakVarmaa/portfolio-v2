import { MAX_SOURCE_CHARS, analyze, type AnalysisResult } from '../lib/review/analyze.ts'
import type { AcornLike } from '../lib/review/ast.ts'
import { defineWorker } from './_base.ts'

/**
 * The review service worker. One handler:
 *
 *   review.analyze  source -> pattern rules + acorn AST pass + tiering -> { findings, stages, parsed }
 *
 * The answer is a superset of the protocol's result (`AnalysisResult` adds `parseError`, `lines` and
 * `commentChars`); the protocol file is untouched. A `progress` message is posted as each of the five stages
 * starts, so the panel's schematic lights in the order the work really happens.
 *
 * acorn is its own chunk, fetched by the first job rather than at boot (every visitor would pay for it
 * otherwise); the demo sends an empty warm-up job when it mounts so the parser is usually here before the
 * first real review. If the import fails, the review still runs its pattern rules and says the parser is missing.
 */

let parser: Promise<AcornLike | null> | null = null

function loadParser(): Promise<AcornLike | null> {
  parser ??= import('acorn').then(
    (module) => module as unknown as AcornLike,
    () => {
      parser = null // try again on the next job
      return null
    },
  )
  return parser
}

defineWorker('review-a', {
  'review.analyze': async (payload, ctx) => {
    if (typeof payload.source !== 'string') throw new Error('There is no source to review.')
    if (payload.source.length > MAX_SOURCE_CHARS) {
      throw new Error(`The source is longer than ${MAX_SOURCE_CHARS.toLocaleString('en-US')} characters.`)
    }
    const acorn = await loadParser()
    const result: AnalysisResult = analyze(payload.source, { acorn, onStage: (stage) => ctx.progress({ stage }) })
    return result
  },
})
