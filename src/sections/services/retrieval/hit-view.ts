/**
 * What a retrieved passage says about itself, read off the data the worker measured: where it sits on the page,
 * which sentence it cites, which stretch of it a card shows, and what the page has to change to show that sentence.
 * No React and no DOM, so the card, the demo and the tests all read hits the same way.
 */
import type { Depth } from '../../../data/copy.ts'
import type { CorpusPart, TextRange } from '../../../lib/retrieval/corpus.ts'
import type { RichHit } from '../../../lib/retrieval/types.ts'

/** The part of the page element a hit cites: the one holding the cited sentence, else the window's first. */
export function citedPart(hit: RichHit): CorpusPart {
  return hit.parts[hit.evidence?.part ?? 0] ?? hit.parts[0] ?? { label: hit.chunkId, from: 0, to: hit.text.length }
}

/** `Service 01 · Peer explanation`: where on the page the cited sentence is. */
export function whereLabel(hit: RichHit): string {
  return citedPart(hit).label
}

const startsCut = (part: CorpusPart): boolean => part.cut === 'start' || part.cut === 'both'
const endsCut = (part: CorpusPart): boolean => part.cut === 'end' || part.cut === 'both'

/**
 * The stretch of the window's text a card shows: all of it, unless the corpus build moved an end in off a word that a
 * wordpiece cut broke (`CorpusChunk.shown`: a window that began "% retrieval precision" is shown from "retrieval").
 */
export function shownOf(hit: Pick<RichHit, 'text' | 'shown'>): TextRange {
  return hit.shown ?? { from: 0, to: hit.text.length }
}

/** One page element's share of what a card shows. */
export interface ShownPart {
  /** Index into `hit.parts`. */
  index: number
  part: CorpusPart
  /** The characters of `hit.text` this part shows: its own range, less what `shownOf` leaves off. */
  from: number
  to: number
  /** The page element goes on before (after) what is shown, so a leading (trailing) "…" belongs in the paragraph. */
  cutStart: boolean
  cutEnd: boolean
}

/** The page elements a card shows, in order, each clipped to the shown stretch. An element that is all left off is not listed. */
export function shownParts(hit: Pick<RichHit, 'text' | 'parts' | 'shown'>): ShownPart[] {
  const range = shownOf(hit)
  const out: ShownPart[] = []
  hit.parts.forEach((part, index) => {
    const from = Math.max(part.from, range.from)
    const to = Math.min(part.to, range.to)
    if (to <= from) return
    out.push({ index, part, from, to, cutStart: from > part.from || startsCut(part), cutEnd: to < part.to || endsCut(part) })
  })
  return out
}

/** The cited sentence as a card shows it: its words, and whether the window's edge cut it short at either end. */
export interface CitedExcerpt {
  text: string
  cutStart: boolean
  cutEnd: boolean
}

/** How much of the window's start stands in for the sentence when the match was by meaning alone and no sentence stood out. */
const LEAD_CHARS = 140

/** The cited sentence (the first words of the window when no sentence stood out), within the shown stretch. */
export function citedExcerpt(hit: RichHit): CitedExcerpt {
  const range = shownOf(hit)
  const evidence = hit.evidence
  const from = evidence ? Math.max(evidence.from, range.from) : range.from
  const to = evidence ? Math.min(evidence.to, range.to) : Math.min(range.to, range.from + LEAD_CHARS)
  if (evidence && to > from) {
    const part = hit.parts[evidence.part]
    return {
      text: hit.text.slice(from, to),
      cutStart: from > evidence.from || (part !== undefined && evidence.from <= part.from && startsCut(part)),
      cutEnd: to < evidence.to || (part !== undefined && evidence.to >= part.to && endsCut(part)),
    }
  }
  const first = shownParts(hit)[0]
  const end = Math.min(range.to, range.from + LEAD_CHARS)
  return { text: hit.text.slice(range.from, end), cutStart: first?.cutStart ?? false, cutEnd: end < range.to }
}

/** The cited sentence itself, as a card shows it and as the page is searched for it. */
export function citedSentence(hit: RichHit): string {
  return citedExcerpt(hit).text
}

/** A window with this many page elements or fewer is shown whole at the Engineer and Peer depths; a longer one starts as an excerpt. */
export const WHOLE_LIMIT = 5
/** At the 30-second depth a lone element is shown with its neighbours while the lot fits in this many characters (about seven lines of the card). */
export const PLAIN_BUDGET = 480

/** Which of a card's page elements are shown: `first` to `last`, inclusive, as indexes into `shownParts`. */
export interface PassageRange {
  first: number
  last: number
  /** Something is left out of the excerpt, so the card offers to show the whole window (and to go back). */
  expandable: boolean
}

/**
 * Which page elements of a window the card shows. `at` is the element holding the cited sentence.
 *
 *   Engineer and Peer  the whole window when it has five elements or fewer, else the element and the one on each side:
 *                      what the retriever returned, as far as it fits.
 *   30-second          what answers the question and no more: the cited element's whole group when it has one (a release:
 *                      role, organization, period, note; a work-trace entry: its label and its text), else the element
 *                      and the neighbours that fit in `PLAIN_BUDGET` characters, the one before it first. An element
 *                      that is longer than the budget is shown alone, whole: the exact paragraph that was found.
 *
 * `whole` (the visitor pressed "show all") shows everything; `expandable` still says whether there is more than the excerpt.
 */
export function passageRange(parts: readonly ShownPart[], at: number, deep: boolean, whole: boolean): PassageRange {
  const all = { first: 0, last: parts.length - 1 }
  if (parts.length === 0) return { ...all, expandable: false }
  const at0 = Math.min(Math.max(0, at), parts.length - 1)
  let excerpt: { first: number; last: number }
  if (deep) {
    excerpt = parts.length > WHOLE_LIMIT ? { first: Math.max(0, at0 - 1), last: Math.min(parts.length - 1, at0 + 1) } : all
  } else {
    let [first, last] = [at0, at0]
    const group = parts[at0].part.group
    if (group !== undefined) {
      while (first > 0 && parts[first - 1].part.group === group) first -= 1
      while (last < parts.length - 1 && parts[last + 1].part.group === group) last += 1
    } else {
      const size = (entry: ShownPart): number => entry.to - entry.from
      let total = size(parts[at0])
      for (let grew = true; grew; ) {
        grew = false
        if (first > 0 && total + size(parts[first - 1]) <= PLAIN_BUDGET) {
          first -= 1
          total += size(parts[first])
          grew = true
        }
        if (last < parts.length - 1 && total + size(parts[last + 1]) <= PLAIN_BUDGET) {
          last += 1
          total += size(parts[last])
          grew = true
        }
      }
    }
    excerpt = { first, last }
  }
  const expandable = excerpt.last - excerpt.first + 1 < parts.length
  return { ...(whole ? all : excerpt), expandable }
}

/** What the page must switch on before the cited sentence is on screen. */
export interface CiteNeeds {
  /** The depth to switch to, or null when the page already shows the sentence's depth (or it has none). */
  depth: Depth | null
  /** True when the sentence is a plain-language caption and the captions are switched off. */
  plain: boolean
}

export function citeNeeds(hit: RichHit, current: { depth: Depth; plain: boolean }): CiteNeeds {
  const part = citedPart(hit)
  return {
    depth: part.depth && part.depth !== current.depth ? part.depth : null,
    plain: part.kind === 'plain' && !current.plain,
  }
}

/** The depth names a visitor reads in the explanation switch. */
export const DEPTH_NAMES: Readonly<Record<Depth, string>> = { '30s': '30-second', engineer: 'Engineer', peer: 'Peer' }

/**
 * Whether the answer shows the engineer's side of a retrieval: the wordpiece offsets of the window, its chunk id, the sum
 * behind a BM25 score, the stage timings open. The 30-second depth (the default) is for a reader who wants the passage and
 * where it came from; Engineer and Peer are for the one who wants to check the machinery.
 */
export function showsInternals(depth: Depth): boolean {
  return depth !== '30s'
}
