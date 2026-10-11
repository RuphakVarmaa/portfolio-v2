/**
 * BERT WordPiece (uncased) in plain TypeScript: the tokenizer all-MiniLM-L6-v2 was trained with.
 *
 * Why it is hand-written and not `@huggingface/transformers`: that package drags in `sharp` and a dev
 * build of ONNX Runtime (spec 6.1). The algorithm is small and fully specified, so it lives here.
 *
 *   1. clean:      drop control characters, turn every kind of whitespace into a space
 *   2. CJK:        put a space around each CJK ideograph
 *   3. normalize:  lowercase, then strip accents (NFD, remove combining marks)
 *   4. punctuation: every punctuation character becomes a token of its own
 *   5. WordPiece:  greedy longest-match-first against the vocabulary, continuation pieces carry `##`
 *                  (a word with no full match, or longer than 100 characters, becomes `[UNK]`)
 *
 * Every token keeps the UTF-16 offsets of the text it came from, which is what lets the corpus builder
 * cut a window at wordpiece N and still hand back an exact substring of the page's own text.
 *
 * Pure and DOM-free: the build script, the retrieval worker and the tests all import this file. It reads
 * no file and no network; callers pass the contents of `public/models/minilm/vocab.txt` to `parseVocab`.
 */

export interface Vocab {
  /** Number of entries (30522 for bert-base-uncased). */
  readonly size: number
  /** token -> id */
  readonly ids: ReadonlyMap<string, number>
  /** id -> token */
  readonly tokens: readonly string[]
  readonly pad: number
  readonly unk: number
  readonly cls: number
  readonly sep: number
}

/** Parse the contents of a BERT `vocab.txt`: one token per line, the line number is the id. */
export function parseVocab(text: string): Vocab {
  const lines = text.split('\n')
  // The file ends with a newline; that final empty "line" is not a token.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const tokens = lines.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
  const ids = new Map<string, number>()
  tokens.forEach((token, id) => {
    if (!ids.has(token)) ids.set(token, id)
  })
  const need = (token: string): number => {
    const id = ids.get(token)
    if (id === undefined) throw new Error(`vocab.txt has no ${token} token: this is not a BERT vocabulary`)
    return id
  }
  return { size: tokens.length, ids, tokens, pad: need('[PAD]'), unk: need('[UNK]'), cls: need('[CLS]'), sep: need('[SEP]') }
}

/** One wordpiece with the span of the original text it was cut from. */
export interface WordPiece {
  /** The piece as it appears in the vocabulary (`pg`, `##ve`, ...); `[UNK]` for an unknown word. */
  piece: string
  id: number
  /** UTF-16 offset into the original text where this piece starts. */
  start: number
  /** UTF-16 offset where it ends (exclusive). */
  end: number
  /** True for the first piece of a word (a safe place to cut a window). */
  first: boolean
}

/** One word (or one punctuation mark) after clean, CJK, lowercase and accent stripping. */
export interface BasicWord {
  /** Normalized text: lowercase, no accents. */
  text: string
  /** Normalized characters (code points) and the original offsets each one came from. */
  chars: string[]
  starts: number[]
  ends: number[]
  /** Span in the original text. */
  start: number
  end: number
  /** True when the word is a single punctuation mark. */
  punct: boolean
}

const MAX_WORD_CHARS = 100

const WHITESPACE = /^\p{Zs}$/u
const CONTROL = /^\p{C}$/u
const COMBINING = /\p{Mn}/gu
const PUNCT_CATEGORY = /^\p{P}$/u

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || WHITESPACE.test(ch)
}

function isControl(ch: string): boolean {
  if (ch === '\t' || ch === '\n' || ch === '\r') return false
  return CONTROL.test(ch)
}

/** ASCII symbols count as punctuation too (BERT treats `$`, `+`, `<`, `=`, `>`, `^`, `` ` ``, `|`, `~` that way). */
function isPunctuation(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0
  if ((cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126)) return true
  return PUNCT_CATEGORY.test(ch)
}

function isCjk(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x20000 && cp <= 0x2a6df) ||
    (cp >= 0x2a700 && cp <= 0x2b73f) ||
    (cp >= 0x2b740 && cp <= 0x2b81f) ||
    (cp >= 0x2b820 && cp <= 0x2ceaf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x2f800 && cp <= 0x2fa1f)
  )
}

/**
 * BERT's BasicTokenizer with offsets: the words and punctuation marks of `text`, normalized for an
 * uncased vocabulary. Also the word splitter the BM25 analyzer uses, so "a word" means one thing on this site.
 */
export function basicWords(text: string): BasicWord[] {
  const words: BasicWord[] = []
  let chars: string[] = []
  let starts: number[] = []
  let ends: number[] = []

  const flush = () => {
    if (chars.length === 0) return
    words.push({ text: chars.join(''), chars, starts, ends, start: starts[0], end: ends[ends.length - 1], punct: false })
    chars = []
    starts = []
    ends = []
  }

  let i = 0
  while (i < text.length) {
    const cp = text.codePointAt(i) ?? 0
    const ch = String.fromCodePoint(cp)
    const next = i + ch.length
    if (cp === 0 || cp === 0xfffd || isControl(ch)) {
      i = next
      continue
    }
    if (isWhitespace(ch)) {
      flush()
      i = next
      continue
    }
    if (isCjk(cp)) {
      flush()
      words.push({ text: ch, chars: [ch], starts: [i], ends: [next], start: i, end: next, punct: false })
      i = next
      continue
    }
    const normalized = ch.toLowerCase().normalize('NFD').replace(COMBINING, '')
    for (const nc of normalized) {
      if (isPunctuation(nc)) {
        flush()
        words.push({ text: nc, chars: [nc], starts: [i], ends: [next], start: i, end: next, punct: true })
      } else {
        chars.push(nc)
        starts.push(i)
        ends.push(next)
      }
    }
    i = next
  }
  flush()
  return words
}

function wordPieces(word: BasicWord, vocab: Vocab): WordPiece[] {
  const { chars, starts, ends } = word
  const n = chars.length
  const unk = (): WordPiece[] => [{ piece: '[UNK]', id: vocab.unk, start: word.start, end: word.end, first: true }]
  if (n > MAX_WORD_CHARS) return unk()
  const out: WordPiece[] = []
  let from = 0
  while (from < n) {
    let to = n
    let found: string | null = null
    while (from < to) {
      const piece = (from > 0 ? '##' : '') + chars.slice(from, to).join('')
      if (vocab.ids.has(piece)) {
        found = piece
        break
      }
      to -= 1
    }
    if (found === null) return unk()
    out.push({ piece: found, id: vocab.ids.get(found) as number, start: starts[from], end: ends[to - 1], first: from === 0 })
    from = to
  }
  return out
}

/** Tokenize `text` into wordpieces with source offsets. No `[CLS]` / `[SEP]`. */
export function tokenize(text: string, vocab: Vocab): WordPiece[] {
  const out: WordPiece[] = []
  for (const word of basicWords(text)) out.push(...wordPieces(word, vocab))
  return out
}

/** How many wordpieces `text` is (what the 256-wordpiece windows count). `[CLS]` / `[SEP]` excluded. */
export function countWordPieces(text: string, vocab: Vocab): number {
  return tokenize(text, vocab).length
}

export interface Encoded {
  /** `[CLS]` + wordpiece ids + `[SEP]`. */
  ids: number[]
  /** 1 for every position (no padding is added here; batching pads with the vocab's `[PAD]`). */
  attention: number[]
  /** All zeros: a single segment. */
  typeIds: number[]
  /** The pieces behind `ids` (without the two specials). */
  pieces: WordPiece[]
  /** True when the text was longer than `maxTokens` and the tail was cut. */
  truncated: boolean
}

/**
 * Encoder input for one text: `[CLS] pieces [SEP]`, truncated so the whole sequence fits `maxTokens`
 * (specials included). Same output as the `tokenizers` pipeline in all-MiniLM-L6-v2's `tokenizer.json`.
 */
export function encode(text: string, vocab: Vocab, maxTokens = 512): Encoded {
  const all = tokenize(text, vocab)
  const room = Math.max(0, maxTokens - 2)
  const pieces = all.length > room ? all.slice(0, room) : all
  const ids = [vocab.cls, ...pieces.map((piece) => piece.id), vocab.sep]
  return {
    ids,
    attention: ids.map(() => 1),
    typeIds: ids.map(() => 0),
    pieces,
    truncated: all.length > room,
  }
}
