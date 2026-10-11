import type { Options } from 'acorn'
import type { Finding } from '../../cluster/protocol.ts'
import { MAX_FUNCTION_LINES, MAX_PARAMS, makeFinding } from './rules.ts'
import { FUNCTIONS, child, children, identifierName, walk, type AstNode, type WalkContext } from './walk.ts'

/**
 * The AST pass (spec 6.9): the eleven rules that need a syntax tree, run in one walk. acorn is passed in
 * (`AcornLike`), never imported here, so the main-thread bundle can never pull it in: the review worker
 * loads it with `await import('acorn')` and hands it over, and the tests import it directly.
 */

/** The one function of acorn this file uses. */
export interface AcornLike {
  parse(input: string, options: Options): unknown
}

export interface ParseError {
  message: string
  /** 1-based; 0 when the parser could not be loaded at all. */
  line: number
  column: number
}

export type ParseOutcome = { ok: true; program: AstNode; sourceType: 'module' | 'script' } | { ok: false; error: ParseError }

/**
 * `ecmaVersion: 'latest'`, as a module first (strict, top-level `await`) and then as a script (sloppy mode,
 * `with`, octal literals). Snippets are often pasted from the inside of a function, so a `return` or an
 * `await` outside one is tolerated rather than reported as a syntax error. JSX and TypeScript do not parse:
 * that is the "skipped: not parseable as JavaScript" path.
 */
export function parseSource(acorn: AcornLike, source: string): ParseOutcome {
  const base = {
    ecmaVersion: 'latest',
    locations: true,
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    allowHashBang: true,
  } as const
  let first: unknown
  try {
    return { ok: true, program: acorn.parse(source, { ...base, sourceType: 'module' }) as AstNode, sourceType: 'module' }
  } catch (error) {
    first = error
  }
  try {
    return { ok: true, program: acorn.parse(source, { ...base, sourceType: 'script' }) as AstNode, sourceType: 'script' }
  } catch {
    return { ok: false, error: describeParseError(first) }
  }
}

/** acorn's SyntaxError carries `loc`; its message ends with `(line:column)`, which is shown separately. */
export function describeParseError(error: unknown): ParseError {
  const loc = (error as { loc?: { line?: unknown; column?: unknown } } | null)?.loc
  const raw = error instanceof Error ? error.message : String(error)
  return {
    message: raw.replace(/\s*\(\d+:\d+\)\s*$/, ''),
    line: typeof loc?.line === 'number' ? loc.line : 0,
    column: typeof loc?.column === 'number' ? loc.column : 0,
  }
}

// ---- helpers ---------------------------------------------------------------------------------------

const lineOf = (node: AstNode) => node.loc.start.line
const endLineOf = (node: AstNode) => node.loc.end.line

/** `obj.name` or `obj['name']` with a literal key: the property name, otherwise null. */
function propertyName(member: AstNode): string | null {
  const property = child(member, 'property')
  if (property === null) return null
  if (member.computed !== true) return identifierName(property)
  return property.type === 'Literal' && typeof property.value === 'string' ? property.value : null
}

function isNullLiteral(node: AstNode | null): boolean {
  return node !== null && node.type === 'Literal' && node.raw === 'null'
}

/** An assignment right-hand side that is fixed text: a literal, or a template with nothing interpolated. */
function isFixedText(node: AstNode | null): boolean {
  if (node === null) return false
  if (node.type === 'Literal') return true
  return node.type === 'TemplateLiteral' && children(node, 'expressions').length === 0
}

/** A call that starts a promise nobody is waiting for: `fooAsync()`, `fetch()`, `x.then()`, `x.catch()`, `x.finally()`. */
function startsPromise(call: AstNode): boolean {
  const callee = child(call, 'callee')
  if (callee === null) return false
  const name = callee.type === 'MemberExpression' ? propertyName(callee) : identifierName(callee)
  if (name === null) return false
  if (name === 'fetch') {
    if (callee.type !== 'MemberExpression') return true
    const owner = identifierName(child(callee, 'object'))
    return owner === 'window' || owner === 'self' || owner === 'globalThis'
  }
  if (callee.type === 'MemberExpression' && (name === 'then' || name === 'catch' || name === 'finally')) return true
  return name.endsWith('Async') && name.length > 'Async'.length
}

/** What to call a function in a message: its own name, the variable or property it is assigned to, or "This function". */
function functionName(fn: AstNode, parents: readonly AstNode[]): string | null {
  const own = identifierName(child(fn, 'id'))
  if (own !== null) return own
  const parent = parents[parents.length - 1]
  if (!parent) return null
  if (parent.type === 'VariableDeclarator') return identifierName(child(parent, 'id'))
  if ((parent.type === 'MethodDefinition' || parent.type === 'Property' || parent.type === 'PropertyDefinition') && parent.computed !== true) {
    return identifierName(child(parent, 'key'))
  }
  if (parent.type === 'AssignmentExpression') {
    const left = child(parent, 'left')
    return left !== null && left.type === 'MemberExpression' ? propertyName(left) : identifierName(left)
  }
  return null
}

/** The line a function finding points at: a method's line is its definition's, which includes `async` and `static`. */
function functionLine(fn: AstNode, parents: readonly AstNode[]): number {
  const parent = parents[parents.length - 1]
  if (parent && (parent.type === 'MethodDefinition' || parent.type === 'Property' || parent.type === 'PropertyDefinition')) return lineOf(parent)
  return lineOf(fn)
}

/** Statements after a `return` or `throw` that are still fine: hoisted function declarations and bare `var x`. */
function isHoistedDeclaration(statement: AstNode): boolean {
  if (statement.type === 'FunctionDeclaration') return true
  return statement.type === 'VariableDeclaration' && statement.kind === 'var' && children(statement, 'declarations').every((d) => d.init === null)
}

function checkUnreachable(container: AstNode, findings: Finding[]) {
  const statements = container.type === 'SwitchCase' ? children(container, 'consequent') : children(container, 'body')
  let ended = false
  for (const statement of statements) {
    if (ended) {
      if (isHoistedDeclaration(statement)) continue
      const last = statements[statements.length - 1]
      findings.push(makeFinding('logic.unreachable', lineOf(statement), { endLine: endLineOf(last) }))
      return
    }
    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') ended = true
  }
}

function checkFunction(fn: AstNode, context: WalkContext, findings: Finding[]) {
  const name = functionName(fn, context.parents)
  const subject = name === null ? 'This function' : name
  const line = functionLine(fn, context.parents)

  const body = child(fn, 'body')
  if (body !== null) {
    const lines = endLineOf(body) - lineOf(body) + 1
    if (lines > MAX_FUNCTION_LINES) {
      findings.push(
        makeFinding('maint.long-fn', line, {
          endLine: endLineOf(fn),
          message: `${subject} is ${lines} lines long; the limit is ${MAX_FUNCTION_LINES}.`,
        }),
      )
    }
  }
  const params = children(fn, 'params').length
  if (params > MAX_PARAMS) {
    findings.push(makeFinding('maint.params', line, { message: `${subject} takes ${params} parameters; the limit is ${MAX_PARAMS}.` }))
  }
}

/** Run every AST rule over `program` in one walk. Findings come in walk order; the `tier` stage sorts them. */
export function runAstRules(program: AstNode): Finding[] {
  const findings: Finding[] = []
  walk(program, (node, context) => {
    switch (node.type) {
      case 'CallExpression': {
        const callee = child(node, 'callee')
        const calleeName = callee === null ? null : callee.type === 'MemberExpression' ? propertyName(callee) : identifierName(callee)
        if (calleeName === 'eval' || (calleeName === 'Function' && callee?.type === 'Identifier')) findings.push(makeFinding('sec.eval', lineOf(node)))
        if (callee !== null && callee.type === 'MemberExpression' && (calleeName === 'indexOf' || calleeName === 'includes') && context.loopDepth >= 2) {
          findings.push(makeFinding('perf.nested-indexof', lineOf(node)))
        }
        break
      }
      case 'NewExpression':
        if (identifierName(child(node, 'callee')) === 'Function') findings.push(makeFinding('sec.eval', lineOf(node)))
        break
      case 'AssignmentExpression': {
        const left = child(node, 'left')
        if (left !== null && left.type === 'MemberExpression' && propertyName(left) === 'innerHTML' && (node.operator === '=' || node.operator === '+=')) {
          if (!isFixedText(child(node, 'right'))) findings.push(makeFinding('sec.innerhtml', lineOf(node)))
        }
        break
      }
      case 'ExpressionStatement': {
        const expression = child(node, 'expression')
        if (context.inAsync && expression !== null && expression.type === 'CallExpression' && startsPromise(expression)) {
          findings.push(makeFinding('logic.unawaited', lineOf(node)))
        }
        break
      }
      case 'IfStatement':
      case 'WhileStatement':
      case 'DoWhileStatement': {
        const test = child(node, 'test')
        if (test !== null && test.type === 'AssignmentExpression') findings.push(makeFinding('logic.assign-in-cond', lineOf(test)))
        break
      }
      case 'AwaitExpression':
        if (context.loopDepth >= 1) findings.push(makeFinding('perf.await-in-loop', lineOf(node)))
        break
      case 'VariableDeclaration':
        if (node.kind === 'var') findings.push(makeFinding('style.var', lineOf(node)))
        break
      case 'BinaryExpression':
        if ((node.operator === '==' || node.operator === '!=') && !isNullLiteral(child(node, 'left')) && !isNullLiteral(child(node, 'right'))) {
          findings.push(makeFinding('style.loose-eq', lineOf(node)))
        }
        break
      case 'Program':
      case 'BlockStatement':
      case 'StaticBlock':
      case 'SwitchCase':
        checkUnreachable(node, findings)
        break
    }
    if (FUNCTIONS.has(node.type)) checkFunction(node, context, findings)
  })
  return findings
}
