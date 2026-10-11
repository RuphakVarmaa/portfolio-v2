/**
 * A tiny JSON tokenizer for the Manifest's "View as agent" printout. It never parses or rewrites the file:
 * it only cuts each line of the fetched text into runs (key, string, number, literal, punctuation, space)
 * so the view can style them. Joining the runs of a line gives that line back exactly, for any input, so
 * what is shown is the file's own text, verbatim.
 *
 * Pure and DOM-free: runs under Node type stripping (tests) and in the lazy `JsonView` chunk.
 */

export type JsonTokenKind = 'key' | 'string' | 'number' | 'literal' | 'punct' | 'space'

export interface JsonToken {
  kind: JsonTokenKind
  text: string
}

// One sticky scanner per kind, tried in this order at each position. The last (`other`) always matches,
// so the scan always advances: malformed input still round-trips.
const SPACE = /\s+/y
const STRING = /"(?:[^"\\]|\\.)*"/y
const NUMBER = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y
const LITERAL = /true|false|null/y
const PUNCT = /[{}[\],:]/y
const OTHER = /[^\s{}[\],:"]+|"/y

function match(pattern: RegExp, line: string, at: number): string | null {
  pattern.lastIndex = at
  const found = pattern.exec(line)
  return found && found.index === at ? found[0] : null
}

/** True when the next non-space character after `at` is a colon: the string just read is an object key. */
function isKey(line: string, at: number): boolean {
  let i = at
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++
  return line[i] === ':'
}

/** Cut one line into tokens. `tokens.map(t => t.text).join('') === line` always holds. */
export function tokenizeJsonLine(line: string): JsonToken[] {
  const tokens: JsonToken[] = []
  let at = 0
  while (at < line.length) {
    let text: string | null
    if ((text = match(SPACE, line, at)) !== null) tokens.push({ kind: 'space', text })
    else if ((text = match(STRING, line, at)) !== null) tokens.push({ kind: isKey(line, at + text.length) ? 'key' : 'string', text })
    else if ((text = match(NUMBER, line, at)) !== null) tokens.push({ kind: 'number', text })
    else if ((text = match(LITERAL, line, at)) !== null) tokens.push({ kind: 'literal', text })
    else if ((text = match(PUNCT, line, at)) !== null) tokens.push({ kind: 'punct', text })
    else {
      text = match(OTHER, line, at) ?? line[at]
      tokens.push({ kind: 'literal', text })
    }
    at += text.length
  }
  return tokens
}

/** Cut a whole file into lines of tokens (`\n` or `\r\n`; a final newline does not add an empty line). */
export function tokenizeJson(text: string): JsonToken[][] {
  const lines = text.split(/\r?\n/)
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines.map(tokenizeJsonLine)
}
