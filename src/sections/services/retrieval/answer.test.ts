import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { ComponentType } from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { buildCorpus } from '../../../lib/retrieval/corpus.ts'
import { analyzeQuery } from '../../../lib/retrieval/analyze.ts'
import { RetrievalEngine } from '../../../lib/retrieval/engine.ts'
import { SECTIONS, pageRecords } from '../../../lib/retrieval/page-records.ts'
import type { RichHit, SearchResult } from '../../../lib/retrieval/types.ts'
import { parseVocab } from '../../../lib/retrieval/wordpiece.ts'
import { citedSentence } from './hit-view.ts'

/**
 * The answer, rendered for real. The components are `.tsx` and import CSS modules, which Node cannot load, so this file
 * teaches Node two things before it imports them: `.tsx` is transpiled with the TypeScript compiler the project already
 * has, and a `.css` import is an object whose class names are their own names (`styles.cards` is "cards"). Then the
 * Answer is rendered to HTML on the server, the way the page is prerendered, and the tests read the HTML in order.
 * Nothing is mocked: the hits come from the real engine over the real corpus.
 */
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) {
      return { format: 'module', shortCircuit: true, source: 'export default new Proxy({}, { get: (_target, key) => (typeof key === "string" ? key : undefined) })' }
    }
    if (url.endsWith('.tsx')) {
      const file = fileURLToPath(url)
      const out = ts.transpileModule(readFileSync(file, 'utf8'), {
        fileName: file,
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: true },
      })
      return { format: 'module', shortCircuit: true, source: out.outputText }
    }
    return nextLoad(url, context)
  },
})

// A variable specifier: the type-checker does not follow it into the .tsx files (this project's Node tsconfig has no JSX).
const answerUrl = new URL('./Answer.tsx', import.meta.url).href
const { Answer } = (await import(answerUrl)) as { Answer: ComponentType<Record<string, unknown>> }

const vocab = parseVocab(readFileSync(new URL('../../../../public/models/minilm/vocab.txt', import.meta.url), 'utf8'))
const engine = new RetrievalEngine(buildCorpus({ sections: SECTIONS, records: pageRecords(), vocab }))
const QUESTION = 'What did Ruphak do with pgvector?'
const result = await engine.search(QUESTION, { mode: 'bm25', topK: 5 })

function render(overrides: Record<string, unknown> = {}, found: SearchResult = result): string {
  return renderToStaticMarkup(
    createElement(Answer, {
      id: 1,
      query: QUESTION,
      run: { result: found, roundTripMs: 4.9, where: 'worker' },
      stems: new Set(analyzeQuery(QUESTION).stems),
      depth: '30s',
      plain: true,
      headingLevel: 3,
      standalone: false,
      pipelineShown: false,
      busy: false,
      onCite: () => {},
      ...overrides,
    }),
  )
}

/** What a reader sees: the markup removed, the entities of text decoded. */
const visible = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

const before = (html: string, first: string | RegExp, second: string | RegExp): boolean => {
  const a = typeof first === 'string' ? html.indexOf(first) : html.search(first)
  const b = typeof second === 'string' ? html.indexOf(second) : html.search(second)
  return a >= 0 && b >= 0 && a < b
}

test('the engine answers the placeholder question (the fixtures below are real hits)', () => {
  assert.ok(result.hits.length >= 3)
  assert.equal(result.hits[0].rank, 1)
})

// ---- recruiter-R2-1: the answer comes before how it was measured ------------------------------------------------------

test('at the 30-second depth the first passage comes before the timings, in the order of the page', () => {
  const html = render({ depth: '30s' })
  const text = visible(html)
  const first = citedSentence(result.hits[0])
  // The label, the question, the passages, and only then the disclosure with the stage table.
  assert.ok(before(html, 'class="resultsTitle"', 'class="queryEcho"'))
  assert.ok(before(html, 'class="queryEcho"', 'class="cards"'))
  assert.ok(before(html, 'class="cards"', 'class="how"'))
  assert.ok(before(html, 'class="how"', 'class="stages"'), 'the stage table is inside the disclosure')
  // The text of the first hit is on the page before anything measured.
  const sentenceAt = text.indexOf(first.slice(0, 40))
  assert.ok(sentenceAt >= 0, 'the first hit\'s cited sentence is in the answer')
  for (const measured of ['How this was measured', 'round trip', 'rerank:', 'tokenize']) {
    assert.ok(text.indexOf(measured) > sentenceAt, `"${measured}" comes after the first passage`)
  }
})

test('the first card puts the passage, then the link that finds it on the page, then the rest', () => {
  const html = render({ depth: '30s' })
  const card = html.slice(html.indexOf('<details class="card cardTop"'))
  assert.ok(before(card, 'class="passage"', 'Find it on this page'))
  assert.ok(before(card, 'Find it on this page', 'class="cardFoot"'), 'the link is not at the bottom of the card, after the drawing and the numbers')
  assert.ok(before(card, /class="[^"]*partLabel/, 'Find it on this page'), 'the source label is on the passage')
  assert.match(card, /From: [^<]+/, 'and the link says where it is from')
})

test('the timings are closed at the 30-second depth, open at Engineer and Peer, and open once the pipeline has been shown', () => {
  assert.match(render({ depth: '30s' }), /<details class="how">/)
  assert.match(render({ depth: 'engineer' }), /<details class="how" open="">/)
  assert.match(render({ depth: 'peer' }), /<details class="how" open="">/)
  assert.match(render({ depth: '30s', pipelineShown: true }), /<details class="how" open="">/)
})

test('the note about the drawing is not under every answer: only once "Show me the pipeline" has been pressed', () => {
  assert.ok(!visible(render({ depth: 'engineer' })).includes('This port has no LLM'))
  assert.ok(!visible(render({ depth: '30s' })).includes('production only'))
  const shown = visible(render({ pipelineShown: true }))
  assert.ok(shown.includes('This port has no LLM') && shown.includes('production only'))
})

test('the 30-second depth leaves out the engineer\'s rows: wordpiece offsets, the chunk id, the sum behind the score; Engineer and Peer show them', () => {
  const plain = visible(render({ depth: '30s' }))
  assert.doesNotMatch(plain, /wordpieces/)
  assert.doesNotMatch(plain, /BM25 is the sum of/i)
  assert.doesNotMatch(plain, /each rule is 64/)
  assert.doesNotMatch(plain, /Show the whole window/)
  assert.match(plain, /(?:Part \d+ of \d+ of this section|This section is one part)/, 'the drawing is still there, with a caption in plain words')
  for (const depth of ['engineer', 'peer']) {
    const deep = visible(render({ depth }))
    assert.match(deep, /wordpieces \d+–\d+ \(\d+\)/, depth)
    assert.match(deep, /BM25 is the sum of/i, depth)
    assert.match(deep, /each rule is 64 wordpieces/, depth)
    assert.match(deep, /Window \d+ of \d+ · wordpieces/, depth)
  }
})

test('a long window is an excerpt, and its button and its note do not say "window" to a 30-second reader', () => {
  const long = result.hits.find((hit) => hit.parts.length > 5)
  assert.ok(long, 'a hit with more than five page elements is among the answers')
  assert.match(visible(render({ depth: '30s' })), /Show all \d+ lines/)
  assert.match(visible(render({ depth: '30s' })), /Showing \d+ of \d+ lines, around the answer/)
  assert.match(visible(render({ depth: 'engineer' })), /Show the whole window \(\d+ lines\)/)
})

// ---- craft-CRAFT2-10: the question is echoed once, in mono, under a stencil label -------------------------------------

test('the label over the answer is "Results" and the question is echoed once, not set as the heading', () => {
  const html = render({ depth: '30s' })
  assert.match(html, /<h5 id="[^"]+" class="resultsTitle">Results<\/h5>/)
  assert.ok(!visible(html).includes('Results for'), 'the question is not part of the heading')
  const echo = /<p class="queryEcho"[^>]*>(.*?)<\/p>/.exec(html)
  assert.ok(echo)
  assert.equal(visible(echo[1]).trim(), `q: ${QUESTION}`)
  assert.equal(html.split(QUESTION).length - 1, 1, 'the question appears once in the whole answer')
  assert.match(html, /<section [^>]*aria-labelledby="[^"\s]+ [^"\s]+"/, 'the section is named by the label and the question')
  assert.match(visible(html), /\d+ of \d+ passages|\d+ passages?/)
})

test('the heading level follows the panel: h5 on the home page, h3 on a project page', () => {
  assert.match(render({ headingLevel: 3 }), /<h5 /)
  assert.match(render({ headingLevel: 1 }), /<h3 /)
})

test('a long or messy question cannot take over the card: it is echoed as text, whatever it holds', () => {
  const messy = `<img src=x onerror=alert(1)> ${'x'.repeat(190)}`.slice(0, 200)
  const html = render({ query: messy })
  assert.ok(!html.includes('<img'), 'markup in a question is text')
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
})

test('when nothing matches there is still a label, the question and the way out, and the measured details below', () => {
  const none = { ...result, hits: [], candidates: 0 } as SearchResult
  const html = render({}, none)
  assert.ok(before(html, 'class="queryEcho"', 'class="empty"'))
  assert.ok(before(html, 'class="empty"', 'class="how"'))
  assert.match(visible(html), /Nothing on this page matches that well/)
  assert.ok(!html.includes('class="cards"'))
})

// ---- craft-CRAFT2-3: a cut is a `…` in the line, and a card never starts on the tail of a word -------------------------

/** The text a reader meets first in a paragraph of a passage, after the cut mark if there is one. */
function paragraphs(html: string): string[] {
  return [...html.matchAll(/<p class="(?:partText|partHeading)">(.*?)<\/p>/g)].map((match) => visible(match[1]).replace(/^\s*…\s*/, '').trim())
}

test('no paragraph of any card starts on the tail of a word, and a cut is not a row of its own', () => {
  const html = render({ depth: 'engineer' })
  const rows = paragraphs(html)
  assert.ok(rows.length > 5)
  for (const row of rows) assert.doesNotMatch(row, /^[%,.;:!?)\]}]/, `a paragraph starts on the tail of a word: ${row.slice(0, 40)}`)
  assert.doesNotMatch(html, /<p class="cutNote">…<\/p>/, 'a lone "…" on a ruled row of its own')
  // The rows that remain say how many whole lines were left out, and nothing else.
  const notes = [...html.matchAll(/<p class="cutNote">(.*?)<\/p>/g)].map((match) => match[1])
  assert.ok(notes.length > 0, 'an excerpt leaves whole lines out, and says so')
  for (const note of notes) assert.match(note, /^… \d+ more lines?$/)
  // Where the window does start or end inside a page element, the mark is in the paragraph.
  assert.match(html, /<p class="partText"><span class="cut" aria-hidden="true">…\u00a0<\/span>/)
  assert.match(html, /<span class="cut" aria-hidden="true">\u00a0…<\/span><\/p>/)
})

test('the card for a window that began on "% retrieval precision" starts at "retrieval", with the cut as part of the line', () => {
  const text = '% retrieval precision, sub-2 s p95, and a 70% reduction in manual document analysis time.\nA second element, whole.'
  const sentenceEnd = text.indexOf('\n')
  const hit = {
    chunkId: 'service-retrieval.1',
    anchor: 'service-retrieval',
    text,
    bm25: 2.04,
    window: { start: 192, end: 448 },
    rank: 1,
    mode: 'bm25',
    tokens: 256,
    parts: [
      { label: 'Service 01 · Engineer explanation', from: 0, to: sentenceEnd, depth: 'engineer', cut: 'start' },
      { label: 'Service 01 · In plain words', from: sentenceEnd + 1, to: text.length, kind: 'plain', cut: 'end' },
    ],
    shown: { from: 2, to: text.length },
    evidence: { from: 0, to: sentenceEnd, part: 0 },
    matched: ['pgvector'],
    asked: 1,
    contributions: [{ word: 'pgvector', score: 2.04 }],
    context: 'Agentic RAG Document Intelligence',
    section: { id: 'service-retrieval', title: 'Service 01', tokens: 607, windows: [{ start: 0, end: 256 }, { start: 192, end: 448 }], index: 1 },
  } as unknown as RichHit
  const html = render({ depth: '30s' }, { ...result, hits: [hit], candidates: 1 } as SearchResult)
  const rows = paragraphs(html)
  assert.equal(rows[0], 'retrieval precision, sub-2 s p95, and a 70% reduction in manual document analysis time.')
  assert.ok(!html.includes('% retrieval'), 'the broken head of the word is not on the card at all, not in the passage and not in the preview')
  assert.match(html, /<p class="partText"><span class="cut" aria-hidden="true">…\u00a0<\/span><span class="evidence">/)
  // The last element is cut at its end: the mark follows its words in the same paragraph.
  assert.match(html, /A second element, whole\.<span class="cut" aria-hidden="true">\u00a0…<\/span><\/p>/)
  // The collapsed-card preview of the sentence begins at the same word, with the mark.
  assert.match(html, /<span class="preview"><span class="cut" aria-hidden="true">…\u00a0<\/span>retrieval precision/)
})
