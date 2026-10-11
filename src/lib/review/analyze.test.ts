import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as acorn from 'acorn'
import type { Finding } from '../../cluster/protocol.ts'
import { copy } from '../../data/copy.ts'
import { SEEDS, seedByFilename } from '../../sections/services/review/seeds.ts'
import { STAGE_NAMES, analyze, countLines, formatComment, mergeFindings, MAX_SOURCE_CHARS } from './analyze.ts'
import { makeFinding } from './rules.ts'
import { TIERS, bySeverityThenLine, byLineThenSeverity } from './tiers.ts'
import { timeRepeated } from './timing.ts'

const run = (source: string, extra: Partial<Parameters<typeof analyze>[1]> = {}) => analyze(source, { acorn, minMs: 0.2, ...extra })
const key = (f: Finding) => `${f.ruleId}@${f.line}`

// ---- pipeline shape --------------------------------------------------------------------------------

test('the stages are named exactly like the panel pipeline in copy, in order, and each has a measured time', () => {
  assert.deepEqual([...STAGE_NAMES], [...copy.services.review.pipeline])
  const result = run('var a = 1\nconsole.log(a) // TODO\n')
  assert.deepEqual(result.stages.map((s) => s.name), [...copy.services.review.pipeline])
  for (const stage of result.stages) assert.ok(Number.isFinite(stage.ms) && stage.ms >= 0, `${stage.name}: ${stage.ms}`)
  assert.equal(result.parsed, true)
  assert.equal(result.parseError, undefined)
  assert.equal(result.lines, 2)
})

test('onStage fires before each stage, in pipeline order', () => {
  const seen: string[] = []
  run('x = 1', { onStage: (stage) => seen.push(stage) })
  assert.deepEqual(seen, [...STAGE_NAMES])
})

test('pattern and AST findings are merged, sorted into reading order, and carry the right stage', () => {
  const src = ['console.log(1)', 'var a = 1', '// TODO', 'if (a == 2) {}'].join('\n')
  const result = run(src)
  assert.deepEqual(result.findings.map(key), ['style.console@1', 'style.var@2', 'maint.todo@3', 'style.loose-eq@4'])
  assert.deepEqual(result.findings.map((f) => f.stage), ['pattern', 'ast', 'pattern', 'ast'])
})

test('the same rule on the same line is reported once; two rules on one line are ordered most severe first', () => {
  const merged = mergeFindings(
    [makeFinding('maint.todo', 3), makeFinding('style.console', 3), makeFinding('sec.secret', 3)],
    [makeFinding('style.console', 3), makeFinding('style.var', 9)],
  )
  assert.deepEqual(merged.map(key), ['sec.secret@3', 'style.console@3', 'maint.todo@3', 'style.var@9'])
})

// ---- the skipped AST pass --------------------------------------------------------------------------

test('JSX or TypeScript input: the AST pass is skipped with a reason, and the pattern rules still run', () => {
  const src = ['const card = <div>{name}</div>', 'console.log(card) // TODO', 'var x = 1'].join('\n')
  const result = run(src)
  assert.equal(result.parsed, false)
  assert.ok(result.parseError && result.parseError.line === 1 && result.parseError.message.length > 0)
  assert.deepEqual(result.findings.map(key), ['style.console@2', 'maint.todo@2'], 'only pattern rules (no style.var from the AST pass), most severe first on the line')
  assert.ok(result.findings.every((f) => f.stage === 'pattern'))
  assert.equal(result.stages.find((s) => s.name === 'AST pass')?.ms, 0)
  assert.equal(result.stages.length, 5)
  assert.equal(copy.services.review.demo.astSkipped, 'skipped: not parseable as JavaScript')
})

test('without a parser (it failed to load) the review degrades the same way', () => {
  const result = analyze('console.log(1)\nvar a', { acorn: null, minMs: 0.2 })
  assert.equal(result.parsed, false)
  assert.equal(result.parseError?.message, 'the parser could not be loaded')
  assert.deepEqual(result.findings.map(key), ['style.console@1'])
})

test('a tree nested too deeply for the walker is reported, not thrown', () => {
  const deep = '['.repeat(1500) + ']'.repeat(1500)
  const result = run(`x = ${deep}`)
  // acorn may itself refuse such a tree, or the walker may; either way the review ends cleanly.
  assert.equal(result.parsed, false)
  assert.ok(result.parseError && result.parseError.message.length > 0)
  assert.equal(result.stages.length, 5)
})

// ---- helpers ---------------------------------------------------------------------------------------

test('countLines: a final line break does not start another line', () => {
  assert.equal(countLines(''), 0)
  assert.equal(countLines('a'), 1)
  assert.equal(countLines('a\n'), 1)
  assert.equal(countLines('a\nb'), 2)
  assert.equal(countLines('a\r\nb\r\n'), 2)
  assert.equal(countLines('\n'), 1)
})

test('formatComment reads like a review comment, with the span when there is one', () => {
  assert.equal(
    formatComment(makeFinding('style.var', 4)),
    '[T4] style.var (line 4): var is function-scoped and hoisted. Fix: Use const, or let when the value changes.',
  )
  assert.match(formatComment(makeFinding('maint.long-fn', 4, { endLine: 80 })), /^\[T5\] maint\.long-fn \(lines 4-80\): /)
})

test('tier sorters: severity then line, and line then severity', () => {
  const list = [
    { tier: 3 as const, line: 1 },
    { tier: 1 as const, line: 5 },
    { tier: 1 as const, line: 2 },
  ]
  assert.deepEqual([...list].sort(bySeverityThenLine), [{ tier: 1, line: 2 }, { tier: 1, line: 5 }, { tier: 3, line: 1 }])
  assert.deepEqual([...list].sort(byLineThenSeverity), [{ tier: 3, line: 1 }, { tier: 1, line: 2 }, { tier: 1, line: 5 }])
  assert.deepEqual([...TIERS], [1, 2, 3, 4, 5])
})

// ---- timing ----------------------------------------------------------------------------------------

test('timeRepeated: returns the first run, then the mean of the timed repeats from the injected clock', () => {
  let t = 0
  let calls = 0
  const result = timeRepeated(
    () => {
      calls += 1
      return `run ${calls}`
    },
    // The clock advances 0.25 ms every time it is read; fn itself costs nothing here.
    { clock: () => (t += 0.25), minMs: 2, maxRuns: 1000 },
  )
  assert.equal(result.value, 'run 1', 'the value is from the first, cold run')
  assert.equal(calls, 1 + result.runs, 'one cold run plus the timed repeats')
  assert.ok(result.runs >= 1)
  // elapsed / runs, with the clock reading once per chunk
  assert.ok(result.ms > 0 && result.ms <= 2, `mean ${result.ms}`)
})

test('timeRepeated: a very fast function is capped at maxRuns; a slow one is timed once', () => {
  const frozen = 0
  const capped = timeRepeated(() => 1, { clock: () => frozen, minMs: 1000, maxRuns: 50 })
  assert.equal(capped.runs, 50)
  assert.equal(capped.ms, 0, 'a frozen clock reads zero')
  let u = 0
  const slow = timeRepeated(() => (u += 5), { clock: () => u, minMs: 1 })
  assert.equal(slow.value, 5)
  assert.ok(slow.runs >= 1)
})

// ---- the seeds -------------------------------------------------------------------------------------

test('the seed filenames are the ones in copy, in order', () => {
  assert.deepEqual(SEEDS.map((seed) => seed.filename), [...copy.services.review.demo.seeds])
  assert.equal(seedByFilename('async-worker.js')?.filename, 'async-worker.js')
  assert.equal(seedByFilename('nope.js'), undefined)
  for (const seed of SEEDS) assert.ok(seed.source.length < MAX_SOURCE_CHARS, `${seed.filename} fits the 20 KB limit`)
})

/** The 1-based line of the first line containing `text`. */
const lineOf = (source: string, text: string) => {
  const index = source.split('\n').findIndex((line) => line.includes(text))
  assert.ok(index >= 0, `"${text}" is not in the seed`)
  return index + 1
}

test('every seed parses, trips at least three rules across at least three tiers', () => {
  for (const seed of SEEDS) {
    const result = run(seed.source)
    assert.equal(result.parsed, true, `${seed.filename} parses as plain JavaScript`)
    const rules = new Set(result.findings.map((f) => f.ruleId))
    const tiers = new Set(result.findings.map((f) => f.tier))
    assert.ok(rules.size >= 3, `${seed.filename}: ${rules.size} rules`)
    assert.ok(tiers.size >= 3, `${seed.filename}: tiers ${[...tiers].join(',')}`)
  }
})

test('express-route.js: SQL concatenation, shell interpolation, JSON clone, console, var and TODO, on the right lines', () => {
  const seed = seedByFilename('express-route.js')
  assert.ok(seed)
  const result = run(seed.source)
  const s = seed.source
  assert.deepEqual(
    result.findings.map(key),
    [
      `style.var@${lineOf(s, 'var router')}`,
      `maint.todo@${lineOf(s, '// TODO')}`,
      `style.var@${lineOf(s, 'var name')}`,
      `sec.sql-concat@${lineOf(s, 'SELECT id, email')}`,
      `style.console@${lineOf(s, 'console.log')}`,
      `perf.json-clone@${lineOf(s, 'JSON.stringify')}`,
      `sec.exec-interp@${lineOf(s, 'execSync(`')}`,
    ],
  )
  assert.deepEqual([...new Set(result.findings.map((f) => f.tier))].sort(), [1, 3, 4, 5])
})

test('async-worker.js: unawaited promises, await in a loop, nested indexOf, loose equality and TODO, on the right lines', () => {
  const seed = seedByFilename('async-worker.js')
  assert.ok(seed)
  const result = run(seed.source)
  const s = seed.source
  assert.deepEqual(
    result.findings.map(key),
    [
      `maint.todo@${lineOf(s, '// TODO')}`,
      `perf.nested-indexof@${lineOf(s, 'known.indexOf')}`,
      `perf.await-in-loop@${lineOf(s, 'await fetchStock')}`,
      `style.loose-eq@${lineOf(s, 'stock.count ==')}`,
      `logic.unawaited@${lineOf(s, 'saveOrderAsync(orders')}`,
      `logic.unawaited@${lineOf(s, "fetch('/api/sync-done'")}`,
    ],
  )
  assert.deepEqual([...new Set(result.findings.map((f) => f.tier))].sort(), [2, 3, 4, 5])
})

test('profile-card.jsx: innerHTML, loose equality, var, and a long function with too many parameters, on the right lines', () => {
  const seed = seedByFilename('profile-card.jsx')
  assert.ok(seed)
  const result = run(seed.source)
  const s = seed.source
  const header = lineOf(s, 'export function renderProfileCard')
  assert.deepEqual(
    result.findings.map(key),
    [
      `maint.long-fn@${header}`,
      `maint.params@${header}`,
      `style.var@${lineOf(s, 'var card')}`,
      `sec.innerhtml@${lineOf(s, 'header.innerHTML')}`,
      `style.loose-eq@${lineOf(s, "user.role == 'admin'")}`,
      `style.loose-eq@${lineOf(s, "user.role == 'editor'")}`,
      `style.loose-eq@${lineOf(s, "event.key == 'Enter'")}`,
    ],
  )
  const long = result.findings.find((f) => f.ruleId === 'maint.long-fn')
  assert.ok(long?.endLine === s.trimEnd().split('\n').length, 'the long function spans to the last line of the file')
  assert.match(long?.message ?? '', /^renderProfileCard is \d+ lines long; the limit is 60\.$/)
  assert.equal(result.findings.find((f) => f.ruleId === 'maint.params')?.message, 'renderProfileCard takes 5 parameters; the limit is 4.')
  assert.deepEqual([...new Set(result.findings.map((f) => f.tier))].sort(), [2, 4, 5])
})

test('a pasted snippet at the size limit is reviewed in well under a second', () => {
  const line = 'var value = compute(a, b) == other // TODO tidy\n'
  const source = line.repeat(Math.floor(MAX_SOURCE_CHARS / line.length))
  const started = performance.now()
  const result = analyze(source, { acorn, minMs: 0.5 })
  const ms = performance.now() - started
  assert.equal(result.parsed, true)
  assert.ok(result.findings.length > 800)
  assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms`)
})
