import type { Finding } from '../../cluster/protocol.ts'
import type { Tier } from './tiers.ts'

/**
 * The review rules (spec 6.9): the catalogue of all 17, and the six rules that need no syntax tree. Those
 * are regular expressions over lines, run on the right *view* of the source so a comment or a string does
 * not trigger a code rule:
 *
 *   raw       the lines as pasted (secrets are secrets even in a comment)
 *   code      comments blanked, strings kept       (SQL concatenation, shell interpolation need the strings)
 *   bare      comments and string contents blanked (`console.log(` in a string is not a call)
 *   comments  only the comment text                (TODO, FIXME)
 *
 * The AST rules live in `ast.ts` and take their messages from this catalogue too. Plain TypeScript with no
 * DOM, so the worker and the tests import it directly.
 */

export type RuleId =
  | 'sec.eval'
  | 'sec.sql-concat'
  | 'sec.exec-interp'
  | 'sec.secret'
  | 'sec.innerhtml'
  | 'logic.unawaited'
  | 'logic.assign-in-cond'
  | 'logic.unreachable'
  | 'perf.nested-indexof'
  | 'perf.await-in-loop'
  | 'perf.json-clone'
  | 'style.var'
  | 'style.loose-eq'
  | 'style.console'
  | 'maint.long-fn'
  | 'maint.params'
  | 'maint.todo'

export interface RuleMeta {
  id: RuleId
  tier: Tier
  stage: 'pattern' | 'ast'
  /** What is wrong, in one sentence. */
  message: string
  /** What to do about it, in one sentence. */
  fix: string
}

/** Function bodies longer than this many lines, and parameter lists longer than this, are flagged (spec 6.9). */
export const MAX_FUNCTION_LINES = 60
export const MAX_PARAMS = 4

/** In the order of the spec's table. */
export const RULES: Readonly<Record<RuleId, RuleMeta>> = {
  'sec.eval': {
    id: 'sec.eval',
    tier: 1,
    stage: 'ast',
    message: 'eval() or new Function() runs a string as code.',
    fix: 'Parse the data with JSON.parse, or call a named function instead.',
  },
  'sec.sql-concat': {
    id: 'sec.sql-concat',
    tier: 1,
    stage: 'pattern',
    message: 'SQL is built by joining strings with request input.',
    fix: 'Use a parameterised query: pass the values separately, never inside the SQL text.',
  },
  'sec.exec-interp': {
    id: 'sec.exec-interp',
    tier: 1,
    stage: 'pattern',
    message: 'A shell command is built from a template literal with interpolated values.',
    fix: 'Use execFile with an argument array, so input is never read as shell syntax.',
  },
  'sec.secret': {
    id: 'sec.secret',
    tier: 1,
    stage: 'pattern',
    message: 'This looks like a hard-coded secret.',
    fix: 'Load it from the environment or a secrets manager, and rotate this one.',
  },
  'sec.innerhtml': {
    id: 'sec.innerhtml',
    tier: 2,
    stage: 'ast',
    message: 'innerHTML is assigned a value that is not a literal.',
    fix: 'Use textContent, or sanitise the markup first.',
  },
  'logic.unawaited': {
    id: 'logic.unawaited',
    tier: 2,
    stage: 'ast',
    message: 'A promise is started here and neither awaited nor returned.',
    fix: 'await it, return it, or write void in front to say it is deliberate.',
  },
  'logic.assign-in-cond': {
    id: 'logic.assign-in-cond',
    tier: 2,
    stage: 'ast',
    message: 'An assignment sits where a comparison is expected.',
    fix: 'Compare with ===, or move the assignment out of the condition.',
  },
  'logic.unreachable': {
    id: 'logic.unreachable',
    tier: 2,
    stage: 'ast',
    message: 'This code can never run: it follows a return or a throw.',
    fix: 'Delete it, or move it above the return.',
  },
  'perf.nested-indexof': {
    id: 'perf.nested-indexof',
    tier: 3,
    stage: 'ast',
    message: 'indexOf or includes inside nested loops makes this quadratic or worse.',
    fix: 'Build a Set once, outside the loops, and look values up in it.',
  },
  'perf.await-in-loop': {
    id: 'perf.await-in-loop',
    tier: 3,
    stage: 'ast',
    message: 'await inside a loop runs the iterations one after another.',
    fix: 'Start them together and await Promise.all, unless the order matters.',
  },
  'perf.json-clone': {
    id: 'perf.json-clone',
    tier: 3,
    stage: 'pattern',
    message: 'JSON.parse(JSON.stringify(x)) is a slow, lossy deep copy.',
    fix: 'Use structuredClone(x).',
  },
  'style.var': {
    id: 'style.var',
    tier: 4,
    stage: 'ast',
    message: 'var is function-scoped and hoisted.',
    fix: 'Use const, or let when the value changes.',
  },
  'style.loose-eq': {
    id: 'style.loose-eq',
    tier: 4,
    stage: 'ast',
    message: '== and != convert types before they compare.',
    fix: 'Use === and !==.',
  },
  'style.console': {
    id: 'style.console',
    tier: 4,
    stage: 'pattern',
    message: 'console.log is left in code that ships.',
    fix: "Remove it, or use the project's logger.",
  },
  'maint.long-fn': {
    id: 'maint.long-fn',
    tier: 5,
    stage: 'ast',
    message: `This function is longer than ${MAX_FUNCTION_LINES} lines.`,
    fix: 'Split it into smaller functions that each do one job.',
  },
  'maint.params': {
    id: 'maint.params',
    tier: 5,
    stage: 'ast',
    message: `This function takes more than ${MAX_PARAMS} parameters.`,
    fix: 'Pass one options object instead.',
  },
  'maint.todo': {
    id: 'maint.todo',
    tier: 5,
    stage: 'pattern',
    message: 'A TODO or FIXME is left in the code.',
    fix: 'Do it now, or link it to an issue.',
  },
}

export const RULE_IDS = Object.keys(RULES) as RuleId[]

/** A finding for `rule`, with the catalogue's message and fix unless the rule measured something to say instead. */
export function makeFinding(rule: RuleId, line: number, extra: { endLine?: number; message?: string } = {}): Finding {
  const meta = RULES[rule]
  const result: Finding = { ruleId: rule, tier: meta.tier, line, message: extra.message ?? meta.message, fix: meta.fix, stage: meta.stage }
  if (extra.endLine !== undefined && extra.endLine > line) result.endLine = extra.endLine
  return result
}

// ---- masking ---------------------------------------------------------------------------------------

/** The line terminators acorn counts, so line numbers here agree with `loc.line` from the parser. */
const NEWLINE = /[\n\r\u2028\u2029]/
export const LINE_BREAK = /\r\n|[\n\r\u2028\u2029]/

export function splitLines(source: string): string[] {
  return source.split(LINE_BREAK)
}

export interface SourceViews {
  raw: string[]
  code: string[]
  bare: string[]
  comments: string[]
}

type State = 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl' | 'regex'

/** A slash after one of these (or at the start) begins a regular expression; after a name, number or `)` it divides. */
const REGEX_AFTER = /[(,=:[!&|?{};+\-*%<>~^]/
const REGEX_AFTER_WORD = /(?:^|[^\w$.])(?:return|typeof|case|do|else|in|of|void|delete|throw|new|yield|await)$/

/**
 * Walk the source once with a small state machine (comments, three kinds of string, template
 * interpolation, regex literals) and produce the four views described at the top of the file. It is a
 * heuristic lexer, not a parser: a regex literal in an unusual position can fool it, in which case the
 * worst outcome is a missed or extra pattern finding on that line. Newlines are kept in every view, so
 * every view splits into the same lines.
 */
export function maskSource(source: string): SourceViews {
  const code: string[] = []
  const bare: string[] = []
  const comments: string[] = []
  const emit = (k: string, b: string, m: string) => {
    code.push(k)
    bare.push(b)
    comments.push(m)
  }
  let state: State = 'code'
  /** One entry per open `${` inside a template: how many `{` are open inside that expression. */
  const interpolations: Array<{ braces: number }> = []

  /** The last non-blank character of the code view so far, and whether the text before it ends in a keyword. */
  const regexAllowed = (): boolean => {
    let end = code.length - 1
    while (end >= 0 && /\s/.test(code[end])) end -= 1
    if (end < 0) return true
    const last = code[end]
    if (REGEX_AFTER.test(last)) return true
    if (/[\w$]/.test(last)) {
      let start = end
      while (start > 0 && /[\w$]/.test(code[start - 1])) start -= 1
      return REGEX_AFTER_WORD.test(code.slice(Math.max(0, start - 1), end + 1).join(''))
    }
    return false
  }

  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    const d = source[i + 1]

    if (NEWLINE.test(c)) {
      emit(c, c, c)
      // A line comment ends here. A quote or a regex that is still open is a typo or a continuation: close it
      // so one bad line cannot blank the rest of the file.
      if (state === 'line' || state === 'sq' || state === 'dq' || state === 'regex') state = 'code'
      continue
    }

    switch (state) {
      case 'code': {
        if (c === '/' && d === '/') {
          state = 'line'
          emit(' ', ' ', c)
        } else if (c === '/' && d === '*') {
          state = 'block'
          emit(' ', ' ', c)
          emit(' ', ' ', d)
          i += 1
        } else if (c === '/' && regexAllowed()) {
          state = 'regex'
          emit(c, c, ' ')
        } else if (c === "'" || c === '"') {
          state = c === "'" ? 'sq' : 'dq'
          emit(c, c, ' ')
        } else if (c === '`') {
          state = 'tpl'
          emit(c, c, ' ')
        } else {
          if (interpolations.length > 0) {
            const top = interpolations[interpolations.length - 1]
            if (c === '{') top.braces += 1
            else if (c === '}') {
              if (top.braces === 0) {
                interpolations.pop()
                state = 'tpl'
                emit(c, c, ' ')
                break
              }
              top.braces -= 1
            }
          }
          emit(c, c, ' ')
        }
        break
      }
      case 'line':
        emit(' ', ' ', c)
        break
      case 'block':
        if (c === '*' && d === '/') {
          emit(' ', ' ', c)
          emit(' ', ' ', d)
          i += 1
          state = 'code'
        } else emit(' ', ' ', c)
        break
      case 'sq':
      case 'dq': {
        const quote = state === 'sq' ? "'" : '"'
        if (c === '\\' && d !== undefined && !NEWLINE.test(d)) {
          emit(c, ' ', ' ')
          emit(d, ' ', ' ')
          i += 1
        } else if (c === quote) {
          state = 'code'
          emit(c, c, ' ')
        } else emit(c, ' ', ' ')
        break
      }
      case 'tpl':
        if (c === '\\' && d !== undefined && !NEWLINE.test(d)) {
          emit(c, ' ', ' ')
          emit(d, ' ', ' ')
          i += 1
        } else if (c === '`') {
          state = 'code'
          emit(c, c, ' ')
        } else if (c === '$' && d === '{') {
          interpolations.push({ braces: 0 })
          state = 'code'
          emit(c, c, ' ')
          emit(d, d, ' ')
          i += 1
        } else emit(c, ' ', ' ')
        break
      case 'regex':
        if (c === '\\' && d !== undefined && !NEWLINE.test(d)) {
          emit(c, ' ', ' ')
          emit(d, ' ', ' ')
          i += 1
        } else if (c === '[') {
          // A character class may contain an unescaped slash; skip to its end.
          emit(c, ' ', ' ')
          while (i + 1 < source.length && source[i + 1] !== ']' && !NEWLINE.test(source[i + 1])) {
            i += 1
            emit(source[i], ' ', ' ')
          }
        } else if (c === '/') {
          state = 'code'
          emit(c, c, ' ')
        } else emit(c, ' ', ' ')
        break
    }
  }

  return { raw: splitLines(source), code: splitLines(code.join('')), bare: splitLines(bare.join('')), comments: splitLines(comments.join('')) }
}

// ---- the six pattern rules --------------------------------------------------------------------------

const AWS_KEY = /\bAKIA[0-9A-Z]{16}\b/
const API_KEY = /(?<![A-Za-z0-9])sk-[A-Za-z0-9]{20,}/
const PASSWORD = /password\s*=\s*['"]/i

const STRING_LITERAL = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g
const SQL =
  /\b(?:select\b[^'"`]*\bfrom\b|insert\s+into\b|update\b[^'"`]*\bset\b|delete\s+from\b|drop\s+(?:table|database)\b|alter\s+table\b|create\s+(?:table|index)\b)/i
const TAINT = /\breq\.|\bparams\b|\bquery\b|\bbody\b/
const TAINT_AFTER_PLUS = /^\s*\+\s*[^;]*?(?:\breq\.|\bparams\b|\bquery\b|\bbody\b)/
const TAINT_BEFORE_PLUS = /(?:\breq\.|\bparams\b|\bquery\b|\bbody\b)[^;]*?\+\s*$/
const TEMPLATE_TAINT = /\$\{[^}]*(?:\breq\.|\bparams\b|\bquery\b|\bbody\b)[^}]*\}/

/**
 * `sec.sql-concat`: a string that is SQL, joined with `+` to something that came from the request
 * (`req.`, `params`, `query`, `body`), or a template literal whose `${}` holds one of those.
 */
export function sqlConcat(line: string): boolean {
  for (const match of line.matchAll(STRING_LITERAL)) {
    const quote = match[1]
    const text = match[2]
    if (!SQL.test(text)) continue
    if (quote === '`' && TEMPLATE_TAINT.test(match[0])) return true
    const start = match.index ?? 0
    if (TAINT_AFTER_PLUS.test(line.slice(start + match[0].length)) || TAINT_BEFORE_PLUS.test(line.slice(0, start))) return true
  }
  return false
}

const EXEC_INTERP = [
  // a bare call: exec(`...${x}`) or execSync(`...${x}`)
  /(?:^|[^.\w$])exec(?:Sync)?\s*\(\s*`[^`]*\$\{/,
  // a method: child_process.exec(...), cp.execSync(...), anything.execSync(...). `re.exec(`...`)` is a regex, not a shell.
  /\b(?:child_process|childProcess|cp)\s*\.\s*exec(?:Sync)?\s*\(\s*`[^`]*\$\{/,
  /\.\s*execSync\s*\(\s*`[^`]*\$\{/,
]

/** `sec.exec-interp`: `exec(` or `execSync(` given a template literal that interpolates something. */
export function execInterp(line: string): boolean {
  return EXEC_INTERP.some((pattern) => pattern.test(line))
}

const JSON_CLONE = /JSON\s*\.\s*parse\s*\(\s*JSON\s*\.\s*stringify\s*\(/
const CONSOLE_LOG = /\bconsole\s*\.\s*log\s*\(/
const TODO = /\b(?:TODO|FIXME)\b/

/** Run the six pattern rules. Findings come in line order; `tier` (the next stage) sorts and de-duplicates. */
export function runPatternRules(source: string): Finding[] {
  const views = maskSource(source)
  const findings: Finding[] = []
  for (let index = 0; index < views.raw.length; index++) {
    const line = index + 1
    const raw = views.raw[index]
    const code = views.code[index]
    const bare = views.bare[index]
    if (AWS_KEY.test(raw) || API_KEY.test(raw) || PASSWORD.test(raw)) findings.push(makeFinding('sec.secret', line))
    if (sqlConcat(code)) findings.push(makeFinding('sec.sql-concat', line))
    if (execInterp(code)) findings.push(makeFinding('sec.exec-interp', line))
    if (JSON_CLONE.test(bare)) findings.push(makeFinding('perf.json-clone', line))
    if (CONSOLE_LOG.test(bare)) findings.push(makeFinding('style.console', line))
    if (TODO.test(views.comments[index])) findings.push(makeFinding('maint.todo', line))
  }
  return findings
}

/** Used by `sqlConcat`'s tests and by anything that wants to know what counts as request input. */
export const REQUEST_INPUT = TAINT
