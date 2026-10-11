import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as acorn from 'acorn'
import { describeParseError, parseSource, runAstRules } from './ast.ts'
import { MAX_FUNCTION_LINES, RULES, type RuleId } from './rules.ts'
import { walk, type AstNode } from './walk.ts'

/** Parse (as the worker does) and run the AST rules: `rule@line` strings, in walk order. */
function find(source: string): string[] {
  const outcome = parseSource(acorn, source)
  assert.ok(outcome.ok, `did not parse: ${JSON.stringify(source)}`)
  return runAstRules(outcome.program).map((f) => `${f.ruleId}@${f.line}`)
}

const only = (source: string, rule: string) => find(source).filter((entry) => entry.startsWith(`${rule}@`))

// ---- parsing ---------------------------------------------------------------------------------------

test('parse: modules first, then scripts, and snippets pasted from inside a function are tolerated', () => {
  const module = parseSource(acorn, "import fs from 'fs'\nexport const a = 1\nawait fs.ready")
  assert.ok(module.ok && module.sourceType === 'module')
  const script = parseSource(acorn, 'with (Math) { var r = PI }\nvar n = 010')
  assert.ok(script.ok && script.sourceType === 'script', 'sloppy-mode syntax falls back to a script')
  assert.ok(parseSource(acorn, 'return 1').ok, 'a top-level return is allowed')
  assert.ok(parseSource(acorn, 'const x = await load()').ok, 'a top-level await is allowed')
  assert.ok(parseSource(acorn, '#!/usr/bin/env node\nconsole.log(1)').ok, 'a hashbang is allowed')
  assert.ok(parseSource(acorn, '').ok, 'empty source is an empty program')
  assert.ok(parseSource(acorn, 'class A { static #p = 1; get x() { return this.#p } }').ok, 'latest syntax')
})

test('parse: JSX, TypeScript and syntax errors do not parse, and say where', () => {
  const jsx = parseSource(acorn, 'const a = 1\nconst card = <div className="x">hi</div>')
  assert.ok(!jsx.ok)
  assert.equal(jsx.error.line, 2)
  assert.ok(jsx.error.column > 0)
  assert.ok(!/\(\d+:\d+\)/.test(jsx.error.message), 'the (line:col) suffix is shown separately, not repeated in the message')
  assert.ok(jsx.error.message.length > 3)
  const ts = parseSource(acorn, 'const n: number = 1')
  assert.ok(!ts.ok)
  assert.equal(ts.error.line, 1)
  assert.ok(!parseSource(acorn, 'function (').ok)
})

test('describeParseError copes with errors that are not acorn errors', () => {
  assert.deepEqual(describeParseError(new Error('boom (3:4)')), { message: 'boom', line: 0, column: 0 })
  assert.deepEqual(describeParseError('plain'), { message: 'plain', line: 0, column: 0 })
  assert.deepEqual(describeParseError(null), { message: 'null', line: 0, column: 0 })
})

// ---- walker ----------------------------------------------------------------------------------------

test('walker: tracks loop depth per function, async-ness and parents; once-only parts of a loop are outside it', () => {
  const outcome = parseSource(
    acorn,
    [
      'for (let i = init(); i < n; i++) {', // 1: init runs once, test/update/body each iteration
      '  for (const x of list()) {', // 2: list() runs once per outer iteration (depth 1)
      '    inner(x)', // 3: depth 2
      '  }',
      '  const f = async () => { deep() }', // 5: a function in a loop starts again at 0
      '}',
      'while (go()) { body() }', // 7: test and body are both in the loop
    ].join('\n'),
  )
  assert.ok(outcome.ok)
  const seen = new Map<string, { depth: number; inAsync: boolean; parent: string | undefined }>()
  walk(outcome.program, (node: AstNode, ctx) => {
    if (node.type !== 'CallExpression') return
    const callee = node.callee as AstNode
    seen.set(String(callee.name), { depth: ctx.loopDepth, inAsync: ctx.inAsync, parent: ctx.parents[ctx.parents.length - 1]?.type })
  })
  assert.equal(seen.get('init')?.depth, 0, 'a for initialiser runs once')
  assert.equal(seen.get('list')?.depth, 1, 'the iterable of for-of runs once per outer iteration')
  assert.equal(seen.get('inner')?.depth, 2)
  assert.equal(seen.get('deep')?.depth, 0, 'a function body starts again at zero loops')
  assert.equal(seen.get('deep')?.inAsync, true)
  assert.equal(seen.get('inner')?.inAsync, false)
  assert.equal(seen.get('go')?.depth, 1)
  assert.equal(seen.get('body')?.depth, 1)
  assert.equal(seen.get('inner')?.parent, 'ExpressionStatement')
})

test('walker: visits every node once, parents before children', () => {
  const outcome = parseSource(acorn, 'function f(a) { return a + 1 }')
  assert.ok(outcome.ok)
  const order: string[] = []
  walk(outcome.program, (node) => order.push(node.type))
  assert.deepEqual(order, ['Program', 'FunctionDeclaration', 'Identifier', 'Identifier', 'BlockStatement', 'ReturnStatement', 'BinaryExpression', 'Identifier', 'Literal'])
})

// ---- sec.eval --------------------------------------------------------------------------------------

test('sec.eval: eval(), new Function() and Function(); not look-alikes', () => {
  assert.deepEqual(only("eval('1 + 1')", 'sec.eval'), ['sec.eval@1'])
  assert.deepEqual(only("const f = new Function('a', 'return a')", 'sec.eval'), ['sec.eval@1'])
  assert.deepEqual(only("const f = Function('return 1')", 'sec.eval'), ['sec.eval@1'])
  assert.deepEqual(only("window.eval('x')", 'sec.eval'), ['sec.eval@1'])
  assert.deepEqual(only('evaluate(x); obj.myEval(); JSON.parse(s); new Date(); new FunctionBuilder()', 'sec.eval'), [])
})

// ---- sec.innerhtml ---------------------------------------------------------------------------------

test('sec.innerhtml: assigning a non-literal to innerHTML', () => {
  assert.deepEqual(only('el.innerHTML = userInput', 'sec.innerhtml'), ['sec.innerhtml@1'])
  assert.deepEqual(only("el.innerHTML += '<b>' + name", 'sec.innerhtml'), ['sec.innerhtml@1'])
  assert.deepEqual(only("el['innerHTML'] = x", 'sec.innerhtml'), ['sec.innerhtml@1'])
  assert.deepEqual(only('el.innerHTML = `<p>${x}</p>`', 'sec.innerhtml'), ['sec.innerhtml@1'], 'a template with an interpolation is not a literal')
  assert.deepEqual(only("el.innerHTML = '<b>static</b>'", 'sec.innerhtml'), [])
  assert.deepEqual(only('el.innerHTML = `<b>static</b>`', 'sec.innerhtml'), [])
  assert.deepEqual(only("el.textContent = x; const h = el.innerHTML; el.outerHTML = x; el.innerText = x", 'sec.innerhtml'), [])
})

// ---- logic.unawaited -------------------------------------------------------------------------------

test('logic.unawaited: a promise started as a statement inside an async function', () => {
  const src = [
    'async function run(p) {',
    '  saveAsync(1)', // 2
    "  fetch('/x')", // 3
    '  p.then(done)', // 4
    '  p.catch(log)', // 5
    '  p.finally(end)', // 6
    '  window.fetch("/y")', // 7
    '  obj.updateAsync(2)', // 8
    '}',
  ].join('\n')
  assert.deepEqual(only(src, 'logic.unawaited'), ['logic.unawaited@2', 'logic.unawaited@3', 'logic.unawaited@4', 'logic.unawaited@5', 'logic.unawaited@6', 'logic.unawaited@7', 'logic.unawaited@8'])
})

test('logic.unawaited: awaited, returned, assigned, voided, or outside an async function is fine', () => {
  const src = [
    'async function ok(p) {',
    '  await saveAsync(1)',
    "  const r = fetch('/x')",
    '  void p.then(done)',
    '  cache.fetch(key)', // a method called fetch on something else
    '  Async()', // not a name that ends in Async
    "  items.forEach((i) => { fetch('/in-a-sync-callback') })", // nearest function is not async
    '  return p.then(done)',
    '}',
    "function plain() { fetch('/not-async') }",
    "fetch('/top-level')",
  ].join('\n')
  assert.deepEqual(only(src, 'logic.unawaited'), [])
})

test('logic.unawaited: an async arrow inside a sync function counts, a sync arrow inside an async one does not', () => {
  assert.deepEqual(only('function a() { return async () => { saveAsync(1) } }', 'logic.unawaited'), ['logic.unawaited@1'])
  assert.deepEqual(only('async function a() { return () => { saveAsync(1) } }', 'logic.unawaited'), [])
})

// ---- logic.assign-in-cond --------------------------------------------------------------------------

test('logic.assign-in-cond: an assignment as the test of if or while', () => {
  assert.deepEqual(only('if (a = b) {}', 'logic.assign-in-cond'), ['logic.assign-in-cond@1'])
  assert.deepEqual(only('while (m = re.exec(s)) {}', 'logic.assign-in-cond'), ['logic.assign-in-cond@1'])
  assert.deepEqual(only('do {} while (n = next())', 'logic.assign-in-cond'), ['logic.assign-in-cond@1'])
  assert.deepEqual(only('if (a === b) {}\nif ((a = b) !== c) {}\nif (a) a = b\nwhile (i < 3) i += 1', 'logic.assign-in-cond'), [])
})

// ---- logic.unreachable -----------------------------------------------------------------------------

test('logic.unreachable: statements after return or throw in the same block, reported once per block', () => {
  const src = ['function f() {', '  return 1', '  a()', '  b()', '}', 'function g() {', "  throw new Error('x')", '  c()', '}'].join('\n')
  const outcome = parseSource(acorn, src)
  assert.ok(outcome.ok)
  const findings = runAstRules(outcome.program).filter((f) => f.ruleId === 'logic.unreachable')
  assert.deepEqual(findings.map((f) => [f.line, f.endLine]), [[3, 4], [8, undefined]], 'the first unreachable statement, through the last in the block')
})

test('logic.unreachable: switch cases, hoisted function declarations and bare var are exempt, a return in a branch ends nothing', () => {
  assert.deepEqual(only("switch (x) { case 1: return a; b(); case 2: break }", 'logic.unreachable'), ['logic.unreachable@1'])
  assert.deepEqual(only('function f() { return g(); function g() {} }', 'logic.unreachable'), [])
  assert.deepEqual(only('function f() { return 1; var later }', 'logic.unreachable'), [])
  assert.deepEqual(only('function f() { return 1; var later = 2 }', 'logic.unreachable'), ['logic.unreachable@1'])
  assert.deepEqual(only('function f(a) { if (a) { return 1 } return 2 }', 'logic.unreachable'), [])
  assert.deepEqual(only('function f() { return 1 }\nafter()', 'logic.unreachable'), [], 'code after a function, not after its return')
})

// ---- perf.nested-indexof ---------------------------------------------------------------------------

test('perf.nested-indexof: indexOf or includes inside a loop inside another loop', () => {
  const nested = ['for (const a of list) {', '  for (const b of other) {', '    if (seen.indexOf(b) === -1) push(b)', '    if (names.includes(a)) hit()', '  }', '}'].join('\n')
  assert.deepEqual(only(nested, 'perf.nested-indexof'), ['perf.nested-indexof@3', 'perf.nested-indexof@4'])
  assert.deepEqual(only('while (a) { for (;;) { xs.indexOf(1) } }', 'perf.nested-indexof'), ['perf.nested-indexof@1'])
})

test('perf.nested-indexof: one loop, a loop in a callback, or a once-only expression is not nested', () => {
  assert.deepEqual(only('for (const a of list) { seen.indexOf(a) }', 'perf.nested-indexof'), [])
  assert.deepEqual(only('xs.indexOf(1); ys.includes(2)', 'perf.nested-indexof'), [])
  assert.deepEqual(only('for (const a of list) { items.forEach(function () { for (;;) { z.indexOf(1) } }) }', 'perf.nested-indexof'), [], 'the callback starts again at depth zero')
  assert.deepEqual(only('for (const a of list) { for (let i = xs.indexOf(a); i < 3; i++) {} }', 'perf.nested-indexof'), [], 'a for initialiser runs once per outer iteration: depth 1')
  assert.deepEqual(only('for (const a of list) { for (const b of xs.indexOf(a) ? p : q) {} }', 'perf.nested-indexof'), [])
})

// ---- perf.await-in-loop ----------------------------------------------------------------------------

test('perf.await-in-loop: await in the body of for, for-of, while and do-while', () => {
  const src = [
    'async function f(ids) {',
    '  for (let i = 0; i < 3; i++) { await a(i) }', // 2
    '  for (const id of ids) { await b(id) }', // 3
    '  while (more()) { await c() }', // 4
    '  do { await d() } while (again())', // 5
    '}',
  ].join('\n')
  assert.deepEqual(only(src, 'perf.await-in-loop'), ['perf.await-in-loop@2', 'perf.await-in-loop@3', 'perf.await-in-loop@4', 'perf.await-in-loop@5'])
})

test('perf.await-in-loop: await outside a loop, in the iterable, or in a function made inside the loop is fine', () => {
  const src = [
    'async function f(ids) {',
    '  await first()',
    '  for (const id of await load()) { use(id) }', // the iterable is awaited once
    '  for (const id of ids) { jobs.push(async () => { await go(id) }) }', // a new function
    '  await Promise.all(jobs)',
    '}',
  ].join('\n')
  assert.deepEqual(only(src, 'perf.await-in-loop'), [])
})

// ---- style.var, style.loose-eq ---------------------------------------------------------------------

test('style.var: var declarations, one finding per statement', () => {
  assert.deepEqual(only('var a = 1, b = 2\nlet c\nconst d = 3\nfor (var i = 0; i < 3; i++) {}', 'style.var'), ['style.var@1', 'style.var@4'])
})

test('style.loose-eq: == and != except against null', () => {
  assert.deepEqual(only('a == b\nc != d\ne === f\ng !== h', 'style.loose-eq'), ['style.loose-eq@1', 'style.loose-eq@2'])
  assert.deepEqual(only('a == null\nnull != b\nc == undefined\nd == 0', 'style.loose-eq'), ['style.loose-eq@3', 'style.loose-eq@4'], 'only null is exempt')
})

// ---- maint.long-fn, maint.params -------------------------------------------------------------------

/** A function whose body spans exactly `bodyLines` lines (the braces' lines included). */
const fnWithBodyLines = (bodyLines: number, head = 'function longOne()') => `${head} {\n${'  work()\n'.repeat(Math.max(0, bodyLines - 2))}}`

test('maint.long-fn: a body of more than 60 lines is flagged, exactly 60 is not', () => {
  assert.deepEqual(only(fnWithBodyLines(MAX_FUNCTION_LINES), 'maint.long-fn'), [])
  const outcome = parseSource(acorn, fnWithBodyLines(MAX_FUNCTION_LINES + 1))
  assert.ok(outcome.ok)
  const [finding] = runAstRules(outcome.program).filter((f) => f.ruleId === 'maint.long-fn')
  assert.equal(finding.line, 1)
  assert.equal(finding.endLine, MAX_FUNCTION_LINES + 1)
  assert.equal(finding.tier, 5)
  assert.equal(finding.message, 'longOne is 61 lines long; the limit is 60.', 'names the function and the measured length')
})

test('maint.long-fn: arrows, methods and function expressions are named from where they are assigned', () => {
  assert.match(runMessage(fnWithBodyLines(70, 'const compute = () =>'), 'maint.long-fn'), /^compute is 70 lines long/)
  assert.match(runMessage(`class A {\n  async run() {\n${'    work()\n'.repeat(68)}  }\n}`, 'maint.long-fn'), /^run is 70 lines long/)
  assert.match(runMessage(fnWithBodyLines(70, 'exports.handler = function ()'), 'maint.long-fn'), /^handler is 70 lines long/)
  assert.match(runMessage(fnWithBodyLines(70, '(function ()') + ')()', 'maint.long-fn'), /^This function is 70 lines long/)
  assert.match(runMessage(`const o = {\n  build() {\n${'    work()\n'.repeat(68)}  }\n}`, 'maint.long-fn'), /^build is 70 lines long/)
})

function runMessage(source: string, rule: string): string {
  const outcome = parseSource(acorn, source)
  assert.ok(outcome.ok, `did not parse: ${source.slice(0, 80)}`)
  const found = runAstRules(outcome.program).find((f) => f.ruleId === rule)
  assert.ok(found, `no ${rule} finding in ${source.slice(0, 80)}`)
  return found.message
}

test('maint.params: more than four parameters; a destructured or rest parameter counts as one', () => {
  assert.deepEqual(only('function f(a, b, c, d) {}', 'maint.params'), [])
  assert.deepEqual(only('function f(a, b, c, d, e) {}', 'maint.params'), ['maint.params@1'])
  assert.deepEqual(only('const f = (a, b, c, d, e, g) => 1', 'maint.params'), ['maint.params@1'])
  assert.deepEqual(only('function f({ a, b, c, d, e, g }) {}', 'maint.params'), [])
  assert.deepEqual(only('function f(a, b, c, d, ...rest) {}', 'maint.params'), ['maint.params@1'])
  assert.deepEqual(only('function f(a, b = 1, c = 2, d = 3) {}', 'maint.params'), [])
  assert.equal(runMessage('function render(a, b, c, d, e) {}', 'maint.params'), 'render takes 5 parameters; the limit is 4.')
})

test('a method is reported on its own line, including modifiers', () => {
  const src = ['class A {', '  static async build(a, b, c, d, e) {', '    return 1', '  }', '}'].join('\n')
  assert.deepEqual(only(src, 'maint.params'), ['maint.params@2'])
})

test('every AST finding is in the catalogue, at the catalogue tier, with stage ast', () => {
  const src = [
    'async function f(a, b, c, d, e) {',
    '  eval(x)',
    '  el.innerHTML = x',
    '  saveAsync(1)',
    '  if (a = b) {}',
    '  for (const i of a) { for (const j of b) { a.indexOf(j); await go(i) } }',
    '  var v = a == b',
    '  return 1',
    '  after()',
    '}',
  ].join('\n')
  const outcome = parseSource(acorn, src)
  assert.ok(outcome.ok)
  const findings = runAstRules(outcome.program)
  assert.deepEqual(
    [...new Set(findings.map((f) => f.ruleId))].sort(),
    ['logic.assign-in-cond', 'logic.unawaited', 'logic.unreachable', 'maint.params', 'perf.await-in-loop', 'perf.nested-indexof', 'sec.eval', 'sec.innerhtml', 'style.loose-eq', 'style.var'],
  )
  for (const finding of findings) {
    assert.equal(finding.stage, 'ast')
    assert.equal(finding.tier, RULES[finding.ruleId as RuleId].tier, finding.ruleId)
  }
})
