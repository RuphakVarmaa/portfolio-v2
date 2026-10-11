/**
 * The BM25 analyzer: text in, the terms that get indexed out.
 *
 *   words      the same word splitter the encoder's tokenizer uses (lowercase, accents stripped, punctuation
 *              split off), so "a word" means one thing everywhere on this site
 *   filter     punctuation, one-letter tokens and a short English stop list are dropped
 *   stem       the Porter (1980) stemmer, so `index`, `indexes` and `indexing` meet in one term
 *
 * SPEC-GAP: spec 6.6 says BM25 runs over WordPiece tokens. It runs over stemmed words instead. Subword
 * pieces turn a rare technical term into noise (`pgvector` -> pg ## ve ## ctor, and `##ctor` matches
 * `vector`), make the matched terms unreadable, and would force the 228 KB vocabulary to download before
 * the first search. WordPiece stays where it belongs: it cuts the 256-wordpiece windows and feeds the
 * encoder. BM25 and the embeddings still share the same chunks, so the two retrieval modes stay comparable.
 *
 * Pure and DOM-free (the build script, the worker and the tests import it).
 */
import { basicWords } from './wordpiece.ts'

/** Words that carry no topic. Short on purpose: BM25's IDF already discounts anything common on the page. */
export const STOPWORDS: ReadonlySet<string> = new Set(
  (
    'a about above after again all am an and any are as at be because been before being below between both but by ' +
    'can could did do does doing down during each few for from further had has have having he her here hers him his ' +
    'how i if in into is it its just me more most my no nor not now of off on once only or other our out over own ' +
    'same she should so some such than that the their them then there these they this those through to too under ' +
    'until up use used uses using very was we were what when where which while who whom why will with would you your'
  ).split(' '),
)

/**
 * Words that are on most of this page and say nothing about which passage answers: the author's name (a byline)
 * and "project" (the page is four of them). They are dropped from a question only when something more specific
 * is left to search for, so "projects" or "Ruphak" on their own still find something.
 */
export const GENERIC_STEMS: ReadonlySet<string> = new Set(['ruphak', 'varmaa', 'project'])

// ---- Porter stemmer --------------------------------------------------------------------------------

const STEP2: Readonly<Record<string, string>> = {
  ational: 'ate',
  tional: 'tion',
  enci: 'ence',
  anci: 'ance',
  izer: 'ize',
  bli: 'ble',
  alli: 'al',
  entli: 'ent',
  eli: 'e',
  ousli: 'ous',
  ization: 'ize',
  ation: 'ate',
  ator: 'ate',
  alism: 'al',
  iveness: 'ive',
  fulness: 'ful',
  ousness: 'ous',
  aliti: 'al',
  iviti: 'ive',
  biliti: 'ble',
  logi: 'log',
}
const STEP3: Readonly<Record<string, string>> = { icate: 'ic', ative: '', alize: 'al', iciti: 'ic', ical: 'ic', ful: '', ness: '' }

const C = '[^aeiou][^aeiouy]*' // a consonant sequence
const V = '[aeiouy][aeiou]*' // a vowel sequence
const MGR0 = new RegExp(`^(${C})?${V}${C}`) // measure > 0
const MEQ1 = new RegExp(`^(${C})?${V}${C}(${V})?$`) // measure = 1
const MGR1 = new RegExp(`^(${C})?${V}${C}${V}${C}`) // measure > 1
const HAS_VOWEL = new RegExp(`^(${C})?[aeiouy]`)
const CVC = new RegExp(`^${C}[aeiouy][^aeiouwxy]$`) // consonant-vowel-consonant, last not w, x or y

const STEP2_RE = /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/
const STEP3_RE = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/
const STEP4_RE = /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/
const STEP4_ION_RE = /^(.+?)(s|t)(ion)$/

/**
 * Words Porter leaves apart that this page treats as one idea (`embed` -> `emb` but `embedding` -> `embed`).
 * A Map, not an object, so a word like `constructor` cannot hit the prototype.
 */
const EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  ['embed', 'embed'],
  ['embeds', 'embed'],
  ['embedded', 'embed'],
  ['embedding', 'embed'],
  ['embeddings', 'embed'],
])

/** Porter's stemming algorithm. Words that are not plain lowercase letters, or shorter than 3, come back unchanged. */
export function stem(input: string): string {
  if (input.length < 3 || !/^[a-z]+$/.test(input)) return input
  const special = EXCEPTIONS.get(input)
  if (special !== undefined) return special
  let w = input
  const firstChar = w[0]
  if (firstChar === 'y') w = 'Y' + w.slice(1)

  // Step 1a: plurals
  if (/^(.+?)(ss|i)es$/.test(w)) w = w.replace(/^(.+?)(ss|i)es$/, '$1$2')
  else if (/^(.+?)([^s])s$/.test(w)) w = w.replace(/^(.+?)([^s])s$/, '$1$2')

  // Step 1b: -eed, -ed, -ing
  const eed = /^(.+?)eed$/.exec(w)
  if (eed) {
    if (MGR0.test(eed[1])) w = w.slice(0, -1)
  } else {
    const ed = /^(.+?)(ed|ing)$/.exec(w)
    if (ed && HAS_VOWEL.test(ed[1])) {
      w = ed[1]
      if (/(at|bl|iz)$/.test(w)) w += 'e'
      else if (/([^aeiouylsz])\1$/.test(w)) w = w.slice(0, -1)
      else if (CVC.test(w)) w += 'e'
    }
  }

  // Step 1c: y -> i
  const y = /^(.+?)y$/.exec(w)
  if (y && HAS_VOWEL.test(y[1])) w = y[1] + 'i'

  // Step 2
  const s2 = STEP2_RE.exec(w)
  if (s2 && MGR0.test(s2[1])) w = s2[1] + STEP2[s2[2]]

  // Step 3
  const s3 = STEP3_RE.exec(w)
  if (s3 && MGR0.test(s3[1])) w = s3[1] + STEP3[s3[2]]

  // Step 4
  const s4 = STEP4_RE.exec(w)
  if (s4) {
    if (MGR1.test(s4[1])) w = s4[1]
  } else {
    const ion = STEP4_ION_RE.exec(w)
    if (ion && MGR1.test(ion[1] + ion[2])) w = ion[1] + ion[2]
  }

  // Step 5
  const e = /^(.+?)e$/.exec(w)
  if (e && (MGR1.test(e[1]) || (MEQ1.test(e[1]) && !CVC.test(e[1])))) w = e[1]
  if (/ll$/.test(w) && MGR1.test(w)) w = w.slice(0, -1)

  return firstChar === 'y' ? 'y' + w.slice(1) : w
}

// ---- terms ---------------------------------------------------------------------------------------

/** One indexed term and where its word sits in the text it came from. */
export interface Term {
  /** The word as normalized by the tokenizer (lowercase, accents stripped). */
  word: string
  /** What BM25 indexes and matches. */
  stem: string
  /** UTF-16 span of the word in the original text. */
  start: number
  end: number
}

/** The content words of `text`, stemmed, each with its span. Punctuation, one-letter tokens and stop words are dropped. */
export function terms(text: string): Term[] {
  const out: Term[] = []
  for (const word of basicWords(text)) {
    if (word.punct) continue
    const t = word.text
    if (t.length < 2 || STOPWORDS.has(t)) continue
    out.push({ word: t, stem: stem(t), start: word.start, end: word.end })
  }
  return out
}

/** The terms BM25 indexes for a chunk: just the stems of `terms(text)`. */
export function analyze(text: string): string[] {
  return terms(text).map((t) => t.stem)
}

export interface AnalyzedQuery {
  /** Distinct stems, in the order they first appear in the question. */
  stems: string[]
  /** One entry per distinct stem: the word the visitor typed, for showing "matched: pgvector". */
  words: Array<{ word: string; stem: string }>
}

/** A question as BM25 sees it. Repeated words count once; generic words (the author's name, "project") are dropped when something specific remains. */
export function analyzeQuery(query: string): AnalyzedQuery {
  const seen = new Set<string>()
  const all: AnalyzedQuery['words'] = []
  for (const term of terms(query)) {
    if (seen.has(term.stem)) continue
    seen.add(term.stem)
    all.push({ word: term.word, stem: term.stem })
  }
  const specific = all.filter((w) => !GENERIC_STEMS.has(w.stem))
  const words = specific.length > 0 ? specific : all
  return { stems: words.map((w) => w.stem), words }
}
