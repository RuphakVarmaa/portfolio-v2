import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GENERIC_STEMS, STOPWORDS, analyze, analyzeQuery, stem, terms } from './analyze.ts'

/** Examples from Porter's 1980 paper (An algorithm for suffix stripping), one per rule. */
const PORTER: Array<[string, string]> = [
  ['caresses', 'caress'], ['ponies', 'poni'], ['ties', 'ti'], ['caress', 'caress'], ['cats', 'cat'],
  ['feed', 'feed'], ['agreed', 'agre'], ['plastered', 'plaster'], ['bled', 'bled'], ['motoring', 'motor'], ['sing', 'sing'],
  ['conflated', 'conflat'], ['troubled', 'troubl'], ['sized', 'size'], ['hopping', 'hop'], ['tanned', 'tan'],
  ['falling', 'fall'], ['hissing', 'hiss'], ['fizzed', 'fizz'], ['failing', 'fail'], ['filing', 'file'],
  ['happy', 'happi'], ['sky', 'sky'],
  ['relational', 'relat'], ['conditional', 'condit'], ['rational', 'ration'], ['valenci', 'valenc'], ['hesitanci', 'hesit'],
  ['digitizer', 'digit'], ['conformabli', 'conform'], ['radicalli', 'radic'], ['differentli', 'differ'], ['vileli', 'vile'],
  ['analogousli', 'analog'], ['vietnamization', 'vietnam'], ['predication', 'predic'], ['operator', 'oper'],
  ['feudalism', 'feudal'], ['decisiveness', 'decis'], ['hopefulness', 'hope'], ['callousness', 'callous'],
  ['formaliti', 'formal'], ['sensitiviti', 'sensit'], ['sensibiliti', 'sensibl'],
  ['triplicate', 'triplic'], ['formative', 'form'], ['formalize', 'formal'], ['electriciti', 'electr'],
  ['electrical', 'electr'], ['hopeful', 'hope'], ['goodness', 'good'],
  ['revival', 'reviv'], ['allowance', 'allow'], ['inference', 'infer'], ['airliner', 'airlin'], ['gyroscopic', 'gyroscop'],
  ['adjustable', 'adjust'], ['defensible', 'defens'], ['irritant', 'irrit'], ['replacement', 'replac'],
  ['adjustment', 'adjust'], ['dependent', 'depend'], ['adoption', 'adopt'], ['homologou', 'homolog'],
  ['communism', 'commun'], ['activate', 'activ'], ['angulariti', 'angular'], ['homologous', 'homolog'],
  ['effective', 'effect'], ['bowdlerize', 'bowdler'],
  ['probate', 'probat'], ['rate', 'rate'], ['cease', 'ceas'], ['controll', 'control'], ['roll', 'roll'],
]

test('the Porter stemmer reproduces the examples in the original paper', () => {
  const wrong = PORTER.filter(([word, expected]) => stem(word) !== expected).map(([word, expected]) => `${word}: ${stem(word)} (want ${expected})`)
  assert.deepEqual(wrong, [])
})

test('stem leaves short words, numbers and mixed tokens alone', () => {
  for (const word of ['is', 'ab', 'p95', '100k', '2026', 'v2026', 'rbac', 'hnsw', 'pgvector']) assert.equal(stem(word), word)
})

test('the words this site is about meet their own variants', () => {
  assert.equal(stem('index'), stem('indexes'))
  assert.equal(stem('index'), stem('indexing'))
  assert.equal(stem('chunk'), stem('chunks'))
  assert.equal(stem('chunk'), stem('chunking'))
  assert.equal(stem('embed'), stem('embeddings'))
  assert.equal(stem('project'), stem('projects'))
  assert.equal(stem('reduce'), stem('reduced'))
  assert.equal(stem('policy'), stem('policies'))
  assert.equal(stem('window'), stem('windows'))
})

test('analyze keeps content words, drops punctuation, one-letter tokens and stop words', () => {
  // The index keeps the author's name and "project": only a question drops them (see analyzeQuery).
  assert.deepEqual(analyze('What did Ruphak do with pgvector?'), ['ruphak', 'pgvector'])
  assert.deepEqual(analyze('Which cloud did Neural Inverse use?'), ['cloud', 'neural', 'invers'])
  assert.deepEqual(analyze('Multi-Tenant RBAC Platform'), ['multi', 'tenant', 'rbac', 'platform'])
  assert.deepEqual(analyze('a, b & c.'), [])
  assert.deepEqual(analyze(''), [])
  assert.deepEqual(analyze('Résumé of Café'), ['resum', 'cafe'])
  // Numbers are content: "87%" is a fact somebody might ask about.
  assert.deepEqual(analyze('87% precision <2s'), ['87', 'precis', '2s'])
})

test('terms point back at the text they came from', () => {
  const text = 'Chunks are 512-token sliding windows.'
  const found = terms(text)
  assert.deepEqual(found.map((t) => text.slice(t.start, t.end)), ['Chunks', '512', 'token', 'sliding', 'windows'])
  assert.deepEqual(found.map((t) => t.word), ['chunks', '512', 'token', 'sliding', 'windows'])
  assert.deepEqual(found.map((t) => t.stem), ['chunk', '512', 'token', 'slide', 'window'])
})

test('analyzeQuery returns distinct stems in question order, with the visitor\'s words', () => {
  const q = analyzeQuery('How was latency variance reduced? Reduce latency!')
  assert.deepEqual(q.stems, ['latenc', 'varianc', 'reduc'])
  assert.deepEqual(q.words.map((w) => w.word), ['latency', 'variance', 'reduced'])
  assert.deepEqual(analyzeQuery('the of and').stems, [])
})

test('generic words (the author\'s name, "project") are dropped from a question only when something specific is left', () => {
  assert.deepEqual([...GENERIC_STEMS].sort(), ['project', 'ruphak', 'varmaa'])
  assert.deepEqual(analyzeQuery('What did Ruphak do with pgvector?').stems, ['pgvector'])
  assert.deepEqual(analyzeQuery('What broke in the RBAC project?').stems, ['broke', 'rbac'])
  // Alone they are all there is to search for, so they stay.
  assert.deepEqual(analyzeQuery('Ruphak').stems, ['ruphak'])
  assert.deepEqual(analyzeQuery('projects').stems, ['project'])
  assert.deepEqual(analyzeQuery('Ruphak Varmaa projects').stems, ['ruphak', 'varmaa', 'project'])
})

test('the stop list is small and has no domain words in it', () => {
  assert.ok(STOPWORDS.size > 80 && STOPWORDS.size < 200)
  for (const word of ['pgvector', 'index', 'query', 'tenant', 'worker', 'tab', 'broke', 'cloud']) assert.ok(!STOPWORDS.has(word), word)
})
