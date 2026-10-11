/**
 * What a retrieved passage says about itself, read off the data the worker measured: where it sits on the page,
 * which sentence it cites, and what the page has to change to show that sentence. No React and no DOM, so the
 * card, the demo and the tests all read hits the same way.
 */
import type { Depth } from '../../../data/copy.ts'
import type { CorpusPart } from '../../../lib/retrieval/corpus.ts'
import type { RichHit } from '../../../lib/retrieval/types.ts'

/** The part of the page element a hit cites: the one holding the cited sentence, else the window's first. */
export function citedPart(hit: RichHit): CorpusPart {
  return hit.parts[hit.evidence?.part ?? 0] ?? hit.parts[0] ?? { label: hit.chunkId, from: 0, to: hit.text.length }
}

/** `Service 01 · Peer explanation`: where on the page the cited sentence is. */
export function whereLabel(hit: RichHit): string {
  return citedPart(hit).label
}

/** The cited sentence itself (the first words of the window when the match was by meaning alone and no sentence stood out). */
export function citedSentence(hit: RichHit): string {
  const evidence = hit.evidence
  return evidence ? hit.text.slice(evidence.from, evidence.to) : hit.text.slice(0, 140)
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
