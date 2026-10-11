import type { Finding, Stage } from '../../cluster/protocol.ts'
import { parseSource, runAstRules, type AcornLike, type ParseError, type ParseOutcome } from './ast.ts'
import { LINE_BREAK, runPatternRules } from './rules.ts'
import { byLineThenSeverity } from './tiers.ts'
import { timeRepeated } from './timing.ts'

/**
 * The review pipeline (spec 4.6): parse, lint patterns, AST pass, tier, post. One pure function that runs the
 * five stages in order, times each one, and returns the structured findings. The review worker wraps it;
 * the tests call it directly.
 *
 * Honest about what it is: the production pipeline added a structured LLM stage and ran ESLint and Semgrep in
 * a Docker stage. This port runs Semgrep-style pattern rules and a small AST pass in the browser. `post`
 * formats the inline comments (nothing is sent anywhere).
 */

/** Exactly the names in `copy.services.review.pipeline`. */
export const STAGE_NAMES = ['parse', 'lint patterns', 'AST pass', 'tier', 'post'] as const

/** The longest source the demo takes (spec 4.6: max 20 KB, in the page's decimal KB). */
export const MAX_SOURCE_CHARS = 20_000

export interface AnalyzeDeps {
  /** The parser, or null when it could not be loaded: the AST pass is then skipped, the pattern rules still run. */
  acorn: AcornLike | null
  /** High-resolution milliseconds. Default `performance.now`. */
  clock?: () => number
  /** Time each stage over at least this many milliseconds of repeats (see `timeRepeated`). Default 1.5. */
  minMs?: number
  /** Called just before each stage runs: the worker turns it into a `progress` message. */
  onStage?: (stage: (typeof STAGE_NAMES)[number]) => void
}

export interface AnalysisResult {
  /** In reading order: by line, most severe first within a line. */
  findings: Finding[]
  /** One per stage, in pipeline order; each is the mean of repeated runs. `AST pass` is 0 when skipped. */
  stages: Stage[]
  /** False when the AST pass was skipped (not parseable as JavaScript, or the parser was not available). */
  parsed: boolean
  parseError?: ParseError
  /** Lines in the source (a trailing line break does not add one). */
  lines: number
  /** Characters of inline-comment text the `post` stage formatted. */
  commentChars: number
}

/** The lines of `source` as the galley numbers them: a final line break ends the last line instead of starting another. */
export function sourceLines(source: string): string[] {
  if (source === '') return []
  const lines = source.split(LINE_BREAK)
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

export function countLines(source: string): number {
  return sourceLines(source).length
}

/** Merge the two stages' findings: the same rule on the same line is reported once, then reading order. */
export function mergeFindings(...lists: ReadonlyArray<readonly Finding[]>): Finding[] {
  const seen = new Set<string>()
  const merged: Finding[] = []
  for (const list of lists) {
    for (const finding of list) {
      const key = `${finding.ruleId}:${finding.line}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(finding)
    }
  }
  return merged.sort(byLineThenSeverity)
}

/** What a reviewer's inline comment would say. `post` builds these for every finding. */
export function formatComment(finding: Finding): string {
  const where = finding.endLine !== undefined ? `lines ${finding.line}-${finding.endLine}` : `line ${finding.line}`
  return `[T${finding.tier}] ${finding.ruleId} (${where}): ${finding.message} Fix: ${finding.fix}`
}

const NO_PARSER: ParseError = { message: 'the parser could not be loaded', line: 0, column: 0 }

export function analyze(source: string, deps: AnalyzeDeps): AnalysisResult {
  const { acorn, onStage } = deps
  const timing = { clock: deps.clock, minMs: deps.minMs }
  const stages: Stage[] = []
  const mark = (name: (typeof STAGE_NAMES)[number], ms: number) => stages.push({ name, ms })

  onStage?.('parse')
  const parsedStage = timeRepeated<ParseOutcome>(
    () => (acorn === null ? { ok: false, error: NO_PARSER } : parseSource(acorn, source)),
    timing,
  )
  mark('parse', parsedStage.ms)
  const outcome = parsedStage.value

  onStage?.('lint patterns')
  const patterns = timeRepeated(() => runPatternRules(source), timing)
  mark('lint patterns', patterns.ms)

  onStage?.('AST pass')
  let astFindings: Finding[] = []
  let parsed = outcome.ok
  let parseError: ParseError | undefined = outcome.ok ? undefined : outcome.error
  if (outcome.ok) {
    try {
      const program = outcome.program
      const pass = timeRepeated(() => runAstRules(program), timing)
      astFindings = pass.value
      mark('AST pass', pass.ms)
    } catch (error) {
      // A tree nested deeper than the walker's recursion allows: say so instead of failing the whole review.
      if (!(error instanceof RangeError)) throw error
      parsed = false
      parseError = { message: 'the tree is nested too deeply for the AST pass', line: 0, column: 0 }
      mark('AST pass', 0)
    }
  } else {
    mark('AST pass', 0)
  }

  onStage?.('tier')
  const tiered = timeRepeated(() => mergeFindings(patterns.value, astFindings), timing)
  mark('tier', tiered.ms)
  const findings = tiered.value

  onStage?.('post')
  const posted = timeRepeated(() => findings.reduce((chars, finding) => chars + formatComment(finding).length, 0), timing)
  mark('post', posted.ms)

  const result: AnalysisResult = { findings, stages, parsed, lines: countLines(source), commentChars: posted.value }
  if (parseError) result.parseError = parseError
  return result
}
