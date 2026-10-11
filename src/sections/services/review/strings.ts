import type { ParseError } from '../../../lib/review/ast.ts'
import { formatDuration } from '../../../lib/review/timing.ts'

/**
 * The review panel's own words: short UI labels and the sentences the spec leaves to the build. The spec's
 * prose (depth copy, captions, tier labels, the skipped-AST message) comes from `copy.services.review`.
 * SPEC-GAP: if the owner wants every sentence in copy.ts, move this object under `copy.services.review.ui`.
 */

const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`

export const REVIEW_STRINGS = {
  workersLabel: 'Review worker',
  seedsLabel: 'Seeded diffs',
  paste: 'Paste your own JavaScript',
  sourceLabel: 'JavaScript to review',
  count: (n: number, max: number) => `${n.toLocaleString('en-US')} of ${max.toLocaleString('en-US')} characters`,
  limit: 'That is the limit: anything longer was cut off.',
  parseHint: 'Plain JavaScript gets every rule. TypeScript and JSX do not parse, so the rules that need a syntax tree are skipped and only the pattern rules run.',
  run: 'Review it',
  runHint: 'Ctrl or Cmd and Enter also reviews.',
  idle: 'Pick a seeded diff, or paste JavaScript and press Review it.',
  running: 'Reviewing…',
  failed: (message: string) => `The review did not finish: ${message}`,
  pastedName: 'pasted.js',

  /** The whole catalogue, in the open: what the reviewer checks and how. */
  rulesSummary: (count: number) => `What the reviewer checks: all ${count} rules`,
  rulesLead: (patterns: number, trees: number) =>
    `This is the whole list. ${patterns} rules read the text line by line (pattern). The other ${trees} need the syntax tree that acorn builds, so they are skipped for TypeScript and JSX.`,
  how: { pattern: 'pattern', ast: 'syntax tree' },

  tallyLabel: 'Findings by tier',
  /** `T1 Critical 2, go to the first`: the visible label comes first, so the name contains it. */
  jumpLabel: (name: string, count: number) => `${name} ${count}, go to the first`,
  summary: (findings: number, lines: number) => `${findings === 0 ? 'No findings' : plural(findings, 'finding')} in ${plural(lines, 'line')}`,
  noFindings: (lines: number) => `No rule fired on these ${plural(lines, 'line')}. That is not a certificate that the code is right: it is a short list of rules.`,
  /** What the result means, from what it found. Says nothing about which tier blocks a merge: the port has no merge to block. */
  plainReview: (input: { findings: number; lines: number; worst: { name: string; shape: string } | null; parsed: boolean }): string => {
    const { findings, lines, worst, parsed } = input
    const found =
      findings === 0 || worst === null
        ? `The reviewer read ${plural(lines, 'line')} and found nothing to flag.`
        : `The reviewer found ${plural(findings, 'thing')} to look at in ${plural(lines, 'line')} and sorted them into five levels of seriousness. The most serious here is ${worst.name} (${worst.shape}). The notes beside the code say what is wrong and how to fix it.`
    return parsed ? found : `${found} The rules that need a syntax tree did not run on this text, so the list is shorter than it would be for plain JavaScript.`
  },

  hunk: (lines: number, filename: string) => `@@ -0,0 +1,${lines} @@ ${filename}`,
  galleyLabel: (filename: string) => `${filename} with the review comments beside the lines they are about`,
  flagged: (line: number, count: number) => `Line ${line}, ${plural(count, 'finding')}.`,
  fix: 'Fix',
  lines: (line: number, endLine?: number) => (endLine !== undefined ? `lines ${line} to ${endLine}` : `line ${line}`),

  pipelineLabel: 'Pipeline timing',
  skipped: 'skipped',
  pending: 'waiting',
  total: (ms: number) => `${formatDuration(ms)} in the worker`,
  roundTrip: (ms: number) => `${formatDuration(ms)} round trip on this page`,
  timingNote: 'Each stage time is the mean of many repeated runs, because one pass is shorter than the browser clock can resolve. The round trip is a single run.',
  parserSaid: (error: ParseError) =>
    error.line > 0 ? `The parser said: ${error.message}, at line ${error.line}, column ${error.column + 1}.` : `The parser said: ${error.message}.`,
}
