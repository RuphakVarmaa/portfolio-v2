import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { basicWords, countWordPieces, encode, parseVocab, tokenize } from './wordpiece.ts'

const VOCAB_URL = new URL('../../../public/models/minilm/vocab.txt', import.meta.url)
const vocabText = readFileSync(VOCAB_URL, 'utf8')
const vocab = parseVocab(vocabText)

const pieces = (text: string) => tokenize(text, vocab).map((p) => p.piece)

test('vocab.txt is the bert-base-uncased vocabulary (the one all-MiniLM-L6-v2 was trained with)', () => {
  // If this fails someone replaced the file; embeddings made with another vocabulary are garbage.
  assert.equal(createHash('sha256').update(readFileSync(VOCAB_URL)).digest('hex'), '07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3')
  assert.equal(vocab.size, 30522)
  assert.deepEqual([vocab.pad, vocab.unk, vocab.cls, vocab.sep], [0, 100, 101, 102])
})

test('parseVocab ignores the final newline, tolerates CRLF, and rejects a vocabulary without the BERT specials', () => {
  const tiny = parseVocab('[PAD]\r\n[UNK]\r\n[CLS]\r\n[SEP]\r\nhello\r\n')
  assert.equal(tiny.size, 5)
  assert.equal(tiny.ids.get('hello'), 4)
  assert.throws(() => parseVocab('a\nb\nc\n'), /not a BERT vocabulary/)
})

test('matches known WordPiece output of bert-base-uncased', () => {
  // The ids of "Hello, world!" and the pieces of "Using a Transformer network is simple" are the well-known BERT
  // examples. The other two words follow from this exact vocabulary by greedy longest match; they are pinned here
  // so any change to the tokenizer is noticed. (Not compared against a live Hugging Face tokenizer: none was run.)
  assert.deepEqual(tokenize('Hello, world!', vocab).map((p) => p.id), [7592, 1010, 2088, 999])
  assert.deepEqual(encode('Hello, world!', vocab).ids, [101, 7592, 1010, 2088, 999, 102])
  assert.deepEqual(pieces('Using a Transformer network is simple'), ['using', 'a', 'transform', '##er', 'network', 'is', 'simple'])
  assert.deepEqual(pieces('embeddings'), ['em', '##bed', '##ding', '##s'])
  assert.deepEqual(pieces('unaffable'), ['una', '##ffa', '##ble'])
})

test('technical terms split into pieces, and punctuation is a token of its own', () => {
  assert.deepEqual(pieces('pgvector HNSW indexing'), ['pg', '##ve', '##ctor', 'h', '##ns', '##w', 'index', '##ing'])
  assert.deepEqual(pieces('Multi-Tenant'), ['multi', '-', 'tenant'])
  assert.deepEqual(pieces('8.5/10'), ['8', '.', '5', '/', '10'])
  // ASCII symbols are punctuation to BERT, so N+1 is three tokens.
  assert.deepEqual(pieces('N+1'), ['n', '+', '1'])
})

test('accents are stripped and case is folded, like the uncased model expects', () => {
  assert.deepEqual(pieces('Résumé naïve CAFÉ'), ['resume', 'naive', 'cafe'])
  assert.deepEqual(pieces('Résumé'), ['resume'])
})

test('every piece points at the text it came from, pieces of one word are contiguous, and `first` marks word starts', () => {
  const text = 'The pgvector HNSW index — Résumé v2026.06, mAP@0.5!'
  const out = tokenize(text, vocab)
  assert.ok(out.length > 10)
  let previousEnd = 0
  for (const piece of out) {
    assert.ok(piece.start >= previousEnd, 'offsets never go backwards')
    assert.ok(piece.end > piece.start)
    previousEnd = piece.end
    const source = text.slice(piece.start, piece.end).toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
    const bare = piece.piece.replace(/^##/, '')
    assert.equal(source, bare === '[UNK]' ? source : bare)
    assert.equal(piece.first, !piece.piece.startsWith('##'))
  }
  assert.equal(text.slice(out[0].start, out[0].end), 'The')
  // pg + ve + ctor tile "pgvector" exactly.
  const pg = out.findIndex((p) => p.piece === 'pg')
  assert.equal(text.slice(out[pg].start, out[pg + 2].end), 'pgvector')
})

test('empty, whitespace-only and control-character input', () => {
  assert.deepEqual(tokenize('', vocab), [])
  assert.deepEqual(tokenize(' \t\n  ', vocab), [])
  assert.deepEqual(pieces('ab\u0000cd​'), pieces('abcd'))
  assert.equal(countWordPieces('one two three', vocab), 3)
})

test('unknown words become [UNK]; absurdly long words too', () => {
  const unknown = tokenize('◆', vocab)
  assert.equal(unknown.length, 1)
  assert.equal(unknown[0].piece, '[UNK]')
  assert.equal(unknown[0].id, vocab.unk)
  assert.deepEqual(pieces('a'.repeat(101)), ['[UNK]'])
  assert.notDeepEqual(pieces('a'.repeat(100)), ['[UNK]'])
})

test('CJK ideographs are separated from their neighbours', () => {
  const words = basicWords('abc中文def').map((w) => w.text)
  assert.deepEqual(words, ['abc', '中', '文', 'def'])
})

test('basicWords reports original offsets, including after astral characters', () => {
  const text = '😀 Ab-c'
  const words = basicWords(text)
  assert.deepEqual(words.map((w) => w.text), ['😀', 'ab', '-', 'c'])
  assert.deepEqual(words.map((w) => text.slice(w.start, w.end)), ['😀', 'Ab', '-', 'c'])
  assert.deepEqual(words.map((w) => w.punct), [false, false, true, false])
})

test('encode adds the specials and truncates to the limit with them included', () => {
  const text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
  const full = encode(text, vocab, 512)
  assert.equal(full.ids[0], vocab.cls)
  assert.equal(full.ids[full.ids.length - 1], vocab.sep)
  assert.equal(full.ids.length, full.pieces.length + 2)
  assert.equal(full.truncated, false)
  const cut = encode(text, vocab, 16)
  assert.equal(cut.ids.length, 16)
  assert.equal(cut.truncated, true)
  assert.equal(cut.ids[cut.ids.length - 1], vocab.sep)
  assert.deepEqual(cut.attention, new Array(16).fill(1))
  assert.deepEqual(cut.typeIds, new Array(16).fill(0))
})
