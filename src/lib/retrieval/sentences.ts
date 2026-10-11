/**
 * Sentence ranges inside one page element's text: what a citation points at.
 *
 * A boundary is a `.`, `!` or `?` (plus any closing quote or bracket) followed by whitespace, so the
 * periods inside `8.5/10`, `v2026.06`, `mAP@0.5` and `profile.json` never split anything, and a full stop
 * after `e.g.`, `vs.`, `Dr.` and the like is skipped. Fragments of
 * fewer than three words (`B.E.`, `e.g.`, `Email is best.`'s neighbours, `No.`) are joined to the sentence
 * next to them, so an abbreviation does not become a sentence of its own.
 *
 * Pure and DOM-free.
 */

export interface SentenceRange {
  from: number
  to: number
}

const BOUNDARY = /[.!?]+["')\]]*(?=\s)/g
const MIN_WORDS = 3
/** A full stop after one of these is not the end of a sentence. */
const ABBREVIATIONS: ReadonlySet<string> = new Set(['e.g', 'i.e', 'vs', 'cf', 'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'approx', 'inc', 'ltd', 'fig'])

const wordCount = (text: string): number => (text.trim() === '' ? 0 : text.trim().split(/\s+/).length)

/** Ranges (offsets into `text`) of its sentences, trimmed, in order. Empty text gives none. */
export function splitSentences(text: string): SentenceRange[] {
  const raw: SentenceRange[] = []
  let start = 0
  for (const match of text.matchAll(BOUNDARY)) {
    const end = (match.index ?? 0) + match[0].length
    if (match[0] === '.') {
      const word = /(\S+)$/.exec(text.slice(0, end))?.[1] ?? ''
      if (ABBREVIATIONS.has(word.replace(/\.$/, '').toLowerCase())) continue
    }
    raw.push({ from: start, to: end })
    start = end
  }
  if (start < text.length) raw.push({ from: start, to: text.length })

  // Trim whitespace off each range, drop empties.
  const trimmed: SentenceRange[] = []
  for (const range of raw) {
    let { from, to } = range
    while (from < to && /\s/.test(text[from])) from += 1
    while (to > from && /\s/.test(text[to - 1])) to -= 1
    if (to > from) trimmed.push({ from, to })
  }

  // Join short fragments to their neighbour: forwards when there is one, otherwise backwards.
  const out: SentenceRange[] = []
  let carry: SentenceRange | null = null
  for (const range of trimmed) {
    const merged: SentenceRange = carry ? { from: carry.from, to: range.to } : range
    if (wordCount(text.slice(merged.from, merged.to)) < MIN_WORDS && range !== trimmed[trimmed.length - 1]) {
      carry = merged
      continue
    }
    carry = null
    out.push(merged)
  }
  // A short last fragment on its own joins the sentence before it.
  if (out.length > 1) {
    const last = out[out.length - 1]
    if (wordCount(text.slice(last.from, last.to)) < MIN_WORDS) {
      out.pop()
      out[out.length - 1] = { from: out[out.length - 1].from, to: last.to }
    }
  }
  return out
}
