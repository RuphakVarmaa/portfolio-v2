import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_FUNCTION_LINES, MAX_PARAMS, RULES, RULE_IDS, execInterp, makeFinding, maskSource, runPatternRules, splitLines, sqlConcat } from './rules.ts'

const ids = (source: string) => runPatternRules(source).map((f) => `${f.ruleId}@${f.line}`)

test('the catalogue has the 17 rules of the spec table, with the spec tiers and stages', () => {
  const spec: Record<string, [number, 'ast' | 'pattern']> = {
    'sec.eval': [1, 'ast'],
    'sec.sql-concat': [1, 'pattern'],
    'sec.exec-interp': [1, 'pattern'],
    'sec.secret': [1, 'pattern'],
    'sec.innerhtml': [2, 'ast'],
    'logic.unawaited': [2, 'ast'],
    'logic.assign-in-cond': [2, 'ast'],
    'logic.unreachable': [2, 'ast'],
    'perf.nested-indexof': [3, 'ast'],
    'perf.await-in-loop': [3, 'ast'],
    'perf.json-clone': [3, 'pattern'],
    'style.var': [4, 'ast'],
    'style.loose-eq': [4, 'ast'],
    'style.console': [4, 'pattern'],
    'maint.long-fn': [5, 'ast'],
    'maint.params': [5, 'ast'],
    'maint.todo': [5, 'pattern'],
  }
  assert.deepEqual([...RULE_IDS].sort(), Object.keys(spec).sort())
  for (const id of RULE_IDS) {
    assert.deepEqual([RULES[id].tier, RULES[id].stage], spec[id], id)
    assert.ok(RULES[id].message.length > 10 && RULES[id].fix.length > 5, `${id} has a message and a fix`)
    assert.equal(RULES[id].id, id)
  }
  assert.equal(MAX_FUNCTION_LINES, 60)
  assert.equal(MAX_PARAMS, 4)
})

test('makeFinding carries the catalogue values and only sets endLine when it spans lines', () => {
  assert.deepEqual(makeFinding('style.var', 3), {
    ruleId: 'style.var',
    tier: 4,
    line: 3,
    message: RULES['style.var'].message,
    fix: RULES['style.var'].fix,
    stage: 'ast',
  })
  assert.equal(makeFinding('maint.long-fn', 3, { endLine: 9 }).endLine, 9)
  assert.equal('endLine' in makeFinding('maint.long-fn', 3, { endLine: 3 }), false)
  assert.equal(makeFinding('maint.long-fn', 3, { message: 'custom' }).message, 'custom')
})

// ---- masking ---------------------------------------------------------------------------------------

test('masking: a line comment is blanked in code, kept in comments, and a // inside a string is not a comment', () => {
  const v = maskSource('const url = "http://example.com" // TODO fix\nx()')
  assert.equal(v.code[0].trimEnd(), 'const url = "http://example.com"')
  assert.equal(v.code[0].length, v.raw[0].length, 'the comment is blanked, not removed, so columns still line up')
  assert.ok(v.comments[0].trim() === '// TODO fix')
  assert.equal(v.bare[0].includes('example'), false, 'string contents are blank in the bare view')
  assert.ok(v.bare[0].includes('"') && v.bare[0].includes('const url ='), 'quotes and code are kept')
  assert.equal(v.code[1], 'x()')
})

test('masking: block comments span lines and keep the line count', () => {
  const src = 'a()\n/* one\n two console.log(1) */ b()\nc()'
  const v = maskSource(src)
  assert.equal(v.raw.length, 4)
  for (const view of [v.code, v.bare, v.comments]) assert.equal(view.length, 4)
  assert.equal(v.code[1].trim(), '')
  assert.ok(v.code[2].includes('b()') && !v.code[2].includes('console'))
  assert.ok(v.comments[1].includes('one') && v.comments[2].includes('console.log(1)'))
})

test('masking: escaped quotes stay inside the string', () => {
  const v = maskSource('const s = "a \\" console.log(1) \\" b"; run()')
  assert.ok(!v.bare[0].includes('console'), 'still inside the string')
  assert.ok(v.bare[0].includes('run()'))
})

test('masking: template literals keep their ${} expressions as code and blank the text parts', () => {
  const v = maskSource('const t = `hello ${console.log(1)} // not a comment`; next()')
  assert.ok(v.bare[0].includes('console.log(1)'), 'the interpolation is code')
  assert.ok(!v.bare[0].includes('hello') && !v.bare[0].includes('not a comment'))
  assert.ok(v.code[0].includes('// not a comment'), 'the code view keeps string text, and a // in a template is not a comment')
  assert.ok(v.bare[0].includes('next()'))
})

test('masking: nested templates and braces inside an interpolation do not desync the state', () => {
  const v = maskSource('const t = `a ${ {k: `b ${x}`}.k } c`; console.log(2)')
  assert.ok(v.bare[0].endsWith('; console.log(2)'), 'back in code after the template')
  assert.ok(!v.bare[0].includes('c`'), 'the text after the interpolation is still string text, so it is blank')
  assert.ok(v.bare[0].includes('x'), 'the nested interpolation is code')
})

test('masking: a regex literal with quotes in it does not open a string; division is not a regex', () => {
  const regex = maskSource(`const re = /["']/g; console.log(1)`)
  assert.ok(regex.bare[0].includes('console.log(1)'), 'the quote characters inside the regex did not swallow the rest of the line')
  const division = maskSource(`const half = total / 2; const s = 'x'; console.log(3)`)
  assert.ok(division.bare[0].includes('console.log(3)'))
  assert.ok(division.bare[0].includes("' '") && !division.bare[0].includes("'x'"), 'the string after a division is still a string')
  const afterKeyword = maskSource(`function f() { return /['"]/.test(s) } console.log(4)`)
  assert.ok(afterKeyword.bare[0].includes('console.log(4)'))
  const inClass = maskSource(`const re = /[/'"]+/; console.log(5)`)
  assert.ok(inClass.bare[0].includes('console.log(5)'), 'a slash inside a character class does not end the regex')
})

test('masking: an unterminated string ends at the line break so one typo cannot blank the file', () => {
  const v = maskSource(`const s = 'oops\nconsole.log(1)\n`)
  assert.ok(v.bare[1].includes('console.log(1)'))
})

test('masking: every view has the same lines, of the same lengths, as the source (CRLF too)', () => {
  const samples = [
    'a\r\nb // c\r\n/* d\r\ne */ f()\r\n',
    "const a = `x\ny ${z}\nw`; // end\nlast",
    'x = /ab+c/.test(`${s}`) // t\n',
    '',
    '\n\n',
  ]
  for (const sample of samples) {
    const v = maskSource(sample)
    const raw = splitLines(sample)
    assert.equal(v.code.length, raw.length)
    assert.equal(v.bare.length, raw.length)
    assert.equal(v.comments.length, raw.length)
    for (let i = 0; i < raw.length; i++) {
      assert.equal(v.code[i].length, raw[i].length, `code line ${i + 1} of ${JSON.stringify(sample)}`)
      assert.equal(v.bare[i].length, raw[i].length)
      assert.equal(v.comments[i].length, raw[i].length)
    }
  }
})

// ---- sec.secret ------------------------------------------------------------------------------------

test('sec.secret: an AWS access key id, an sk- key and a password assignment; not look-alikes', () => {
  assert.deepEqual(ids('const id = "AKIAIOSFODNN7EXAMPLE"'), ['sec.secret@1'])
  assert.deepEqual(ids("const k = 'sk-abcdefghijklmnopqrstuvwx'"), ['sec.secret@1'])
  assert.deepEqual(ids('const password = "hunter2"'), ['sec.secret@1'])
  assert.deepEqual(ids("dbPassword = 'x'"), ['sec.secret@1'], 'any name ending in password')
  assert.deepEqual(ids('const password = process.env.DB_PASSWORD'), [])
  assert.deepEqual(ids('if (password == "x") {}'), [], 'a comparison is not an assignment')
  assert.deepEqual(ids('const AKIA = 1; const sk = "sk-short"'), [])
  assert.deepEqual(ids('// password = "left in a comment"\nok()'), ['sec.secret@1'], 'a secret in a comment is still a secret')
  assert.deepEqual(ids('const a = "AKIAIOSFODNN7EXAMPLE" + "sk-abcdefghijklmnopqrstuvwx"'), ['sec.secret@1'], 'one finding per rule per line')
})

// ---- sec.sql-concat --------------------------------------------------------------------------------

test('sec.sql-concat: SQL joined with request input, by + or by ${}', () => {
  assert.equal(sqlConcat(`db.query("SELECT * FROM users WHERE id = " + req.params.id)`), true)
  assert.equal(sqlConcat(`db.query('DELETE FROM t WHERE a = ' + params.a)`), true)
  assert.equal(sqlConcat(`db.query("SELECT * FROM t WHERE n = '" + body.name + "'")`), true)
  assert.equal(sqlConcat('db.query(`SELECT * FROM t WHERE n = ${req.query.name}`)'), true)
  assert.equal(sqlConcat('db.query(`UPDATE t SET a = ${body.a} WHERE id = 1`)'), true)
  assert.equal(sqlConcat(`const q = req.query.q + "SELECT id FROM docs WHERE x = 1"`), true, 'input on the left of the plus')
  assert.equal(sqlConcat(`await db.query("INSERT INTO log VALUES (" + query.id + ")")`), true)
})

test('sec.sql-concat: parameterised queries, plain strings and non-SQL are not flagged', () => {
  assert.equal(sqlConcat(`db.query("SELECT * FROM users WHERE id = $1", [req.params.id])`), false)
  assert.equal(sqlConcat(`db.query("SELECT * FROM users WHERE id = " + userId)`), false, 'no request input in the concatenation')
  assert.equal(sqlConcat(`const msg = "Hello " + req.body.name`), false, 'not SQL')
  assert.equal(sqlConcat(`db.query("SELECT 1")`), false)
  assert.equal(sqlConcat('db.query(`SELECT * FROM t WHERE id = ${id}`)'), false)
})

test('sec.sql-concat: a commented-out line is not flagged (the rule reads the code view)', () => {
  assert.deepEqual(ids(`// db.query("SELECT * FROM users WHERE id = " + req.params.id)\nok()`), [])
  assert.deepEqual(ids(`db.query("SELECT * FROM users WHERE id = " + req.params.id)`), ['sec.sql-concat@1'])
})

// ---- sec.exec-interp -------------------------------------------------------------------------------

test('sec.exec-interp: exec or execSync given a template literal with an interpolation', () => {
  assert.equal(execInterp('execSync(`ls ${dir}`)'), true)
  assert.equal(execInterp('exec(`rm -rf ${path}`, cb)'), true)
  assert.equal(execInterp('child_process.exec(`git ${args}`)'), true)
  assert.equal(execInterp('cp.execSync(`echo ${x}`)'), true)
  assert.equal(execInterp('shell.execSync(`echo ${x}`)'), true)
  assert.equal(execInterp('const out = execSync(`tar -czf /tmp/${id}.tgz ${folder}`)'), true)
})

test('sec.exec-interp: plain strings, execFile, template without interpolation and RegExp#exec are not flagged', () => {
  assert.equal(execInterp("execSync('ls')"), false)
  assert.equal(execInterp("execFile('ls', [dir])"), false)
  assert.equal(execInterp('exec(`ls`)'), false)
  assert.equal(execInterp('const m = re.exec(`${line}`)'), false, 'a regular expression, not a shell')
  assert.equal(execInterp('const m = /a+/.exec(`${line}`)'), false)
})

// ---- perf.json-clone, style.console, maint.todo -----------------------------------------------------

test('perf.json-clone: JSON.parse(JSON.stringify(', () => {
  assert.deepEqual(ids('const copy = JSON.parse(JSON.stringify(state))'), ['perf.json-clone@1'])
  assert.deepEqual(ids('const copy = JSON.parse( JSON.stringify( state ) )'), ['perf.json-clone@1'])
  assert.deepEqual(ids('const a = JSON.parse(text); const b = JSON.stringify(x)'), [])
  assert.deepEqual(ids('// JSON.parse(JSON.stringify(x))\nok()'), [])
  assert.deepEqual(ids('const note = "JSON.parse(JSON.stringify(x))"'), [])
})

test('style.console: console.log( in code only', () => {
  assert.deepEqual(ids('console.log("x")'), ['style.console@1'])
  assert.deepEqual(ids('  if (debug) console.log(a, b)'), ['style.console@1'])
  assert.deepEqual(ids('console.error("x"); console.warn("y")'), [])
  assert.deepEqual(ids('// console.log("x")\n/* console.log(1) */\nok()'), [])
  assert.deepEqual(ids('const s = "console.log(x)"; const t = `console.log(y)`'), [])
  assert.deepEqual(ids('const re = /console\\.log\\(/'), [])
  assert.deepEqual(ids('const t = `${console.log(1)}`'), ['style.console@1'], 'inside an interpolation it is a real call')
})

test('maint.todo: TODO and FIXME in comments only', () => {
  assert.deepEqual(ids('// TODO: later'), ['maint.todo@1'])
  assert.deepEqual(ids('x() /* FIXME */'), ['maint.todo@1'])
  assert.deepEqual(ids('/*\n * TODO\n */'), ['maint.todo@2'])
  assert.deepEqual(ids('const label = "TODO"'), [])
  assert.deepEqual(ids('const TODOS = []'), [])
  assert.deepEqual(ids('// todo: lower case is not matched'), [])
})

test('findings carry the right line numbers across a multi-line file, in line order', () => {
  const src = ['const a = 1', '// TODO one', 'console.log(a)', '', 'const k = "AKIAIOSFODNN7EXAMPLE"'].join('\n')
  assert.deepEqual(ids(src), ['maint.todo@2', 'style.console@3', 'sec.secret@5'])
  assert.deepEqual(ids(src.replace(/\n/g, '\r\n')), ['maint.todo@2', 'style.console@3', 'sec.secret@5'], 'CRLF')
  assert.deepEqual(ids(src.replace(/\n/g, '\r')), ['maint.todo@2', 'style.console@3', 'sec.secret@5'], 'CR only')
})

test('adversarial lines finish fast (no catastrophic backtracking on a 20 KB line)', () => {
  const evil = [
    '"' + 'a'.repeat(20_000),
    `"select ${'x '.repeat(5000)}`,
    `db.query("select ${'a'.repeat(5000)}" ${'+ x '.repeat(2000)})`,
    '`' + '${'.repeat(3000),
    "'".repeat(20_000),
    '/'.repeat(20_000),
    `exec(\`${'$'.repeat(10_000)}`,
    'select from '.repeat(1500),
  ]
  const started = performance.now()
  for (const line of evil) runPatternRules(line)
  const ms = performance.now() - started
  assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms`)
})
