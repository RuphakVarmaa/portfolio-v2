import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAgentFiles } from '../../prerender/agent-files.ts'
import { emptyBuildInfo } from '../../prerender/build-info.ts'
import { tokenizeJson, tokenizeJsonLine, type JsonToken } from './json-tokens.ts'

const kinds = (tokens: JsonToken[]) => tokens.filter((t) => t.kind !== 'space').map((t) => `${t.kind}:${t.text}`)

test('a key, a string value and the punctuation around them', () => {
  assert.deepEqual(kinds(tokenizeJsonLine('  "name": "Ruphak Varmaa S",')), ['key:"name"', 'punct::', 'string:"Ruphak Varmaa S"', 'punct:,'])
})

test('numbers, literals and brackets', () => {
  assert.deepEqual(kinds(tokenizeJsonLine('"a": [1, -2.5, 3e4, true, false, null]')), [
    'key:"a"', 'punct::', 'punct:[', 'number:1', 'punct:,', 'number:-2.5', 'punct:,', 'number:3e4', 'punct:,', 'literal:true', 'punct:,', 'literal:false', 'punct:,', 'literal:null', 'punct:]',
  ])
})

test('a string that contains a colon, a quote or a brace is still one string; a key with a space before the colon is a key', () => {
  assert.deepEqual(kinds(tokenizeJsonLine('"url": "https://x.y/z?q=\\"1\\": {a}"')), ['key:"url"', 'punct::', 'string:"https://x.y/z?q=\\"1\\": {a}"'])
  assert.equal(tokenizeJsonLine('"k" : 1')[0].kind, 'key')
  assert.equal(tokenizeJsonLine('"just a string"')[0].kind, 'string')
})

test('indentation is kept as a space token, so the printout keeps its shape', () => {
  const tokens = tokenizeJsonLine('      "x"')
  assert.deepEqual(tokens.map((t) => t.kind), ['space', 'string'])
  assert.equal(tokens[0].text, '      ')
})

test('malformed input still round-trips character for character and the scan terminates', () => {
  for (const line of ['"unterminated', 'plain words here', '{{{ ]] ,, :: ', 'é— "x" ???', '"a\\', '', '   ', '"']) {
    assert.equal(tokenizeJsonLine(line).map((t) => t.text).join(''), line, JSON.stringify(line))
  }
})

test('the real profile.json round-trips line for line (what is shown is what the file says)', () => {
  const { profileJson } = buildAgentFiles({ ...emptyBuildInfo(), builtAt: '2026-10-11T00:00:00.000Z' })
  const lines = tokenizeJson(profileJson)
  const original = profileJson.split('\n')
  original.pop() // the trailing newline
  assert.equal(lines.length, original.length)
  lines.forEach((tokens, index) => assert.equal(tokens.map((t) => t.text).join(''), original[index]))
  const all = lines.flat()
  assert.ok(all.some((t) => t.kind === 'key' && t.text === '"projects"'))
  assert.ok(all.some((t) => t.kind === 'string' && t.text === '"Agentic RAG Document Intelligence"'))
  assert.ok(!all.some((t) => t.kind === 'literal'), 'a well-formed file has no stray literals')
})

test('CRLF and a missing final newline are handled', () => {
  assert.equal(tokenizeJson('{\r\n  "a": 1\r\n}\r\n').length, 3)
  assert.equal(tokenizeJson('{\n}').length, 2)
  assert.equal(tokenizeJson('').length, 1)
})
