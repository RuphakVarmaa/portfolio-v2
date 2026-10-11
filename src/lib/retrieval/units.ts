/**
 * What the encoder embeds: the page elements inside each window, not the window.
 *
 * SPEC-GAP: spec 6.6 embeds each 256-wordpiece window. A window of this page is a heading, a few numbers, a
 * stack line, three explanations and a caption in a row: its one vector is an average of unrelated things, and
 * cosine against it finds little. Tried informally with a local fp32 copy of all-MiniLM-L6-v2 on twenty-eight
 * hand-written questions about this page (a small check, not a benchmark; the build does not reproduce it and
 * nothing from it is claimed on the page). How often the right section came first, out of 28:
 *
 *                                BM25 alone   cosine alone   BM25 + cosine (rank fusion)
 *   embed each window                20            8              20
 *   embed each page element          20           22              23
 *
 * So the port embeds page elements, and a window takes the cosine of its nearest element. Windows stay the unit
 * everything else works in: BM25 ranks windows, hits are windows, citations point into windows, and chunk ids
 * are what a hit carries.
 *
 * A unit is one part of one window (a paragraph, a caption, a work-trace entry, a skills line), read from the
 * corpus alone, with its section's heading in front (it is what lets "the RBAC project" reach text that never
 * says RBAC). Headings, tags and anything under three words are not units: a stencil label is not something a
 * question is about. A page element a window cuts is embedded as the piece the window holds; its neighbour
 * window holds the rest, and the overlap usually holds it whole.
 *
 * The build (scripts/embed-corpus.mjs) and the worker both call `embedUnits`, so the vectors made at build time
 * and the ones made in the browser are made from byte-identical inputs, and a vector is only reused when the
 * hash of its input still matches (see embed.ts).
 *
 * Pure and DOM-free.
 */
import type { Corpus } from './corpus.ts'

/** Under this many words a part is a tag or a label, not something a question is about. */
export const MIN_UNIT_WORDS = 3

export interface EmbedUnit {
  /** `${chunk id}#${part index}`: what an embeddings file keys its vectors by. */
  id: string
  /** Index into `corpus.chunks`. */
  chunk: number
  /** Index into that chunk's `parts`. */
  part: number
  /** Exactly what the encoder is given. */
  input: string
}

/** The section's heading, then the element: `Multi-Tenant RBAC Platform: Queries were taking 340 ms.` */
export function unitInput(context: string, text: string): string {
  return context ? `${context}: ${text}` : text
}

const words = (text: string): number => (text.trim() === '' ? 0 : text.trim().split(/\s+/).length)

/** Every embeddable page element of the corpus, in reading order (chunk by chunk, part by part). */
export function embedUnits(corpus: Pick<Corpus, 'chunks' | 'sections'>): EmbedUnit[] {
  const context = new Map(corpus.sections.map((section) => [section.id, section.context]))
  const units: EmbedUnit[] = []
  corpus.chunks.forEach((chunk, chunkIndex) => {
    chunk.parts.forEach((part, partIndex) => {
      if (part.kind === 'label') return
      const text = chunk.text.slice(part.from, part.to).trim()
      if (words(text) < MIN_UNIT_WORDS) return
      units.push({ id: `${chunk.id}#${partIndex}`, chunk: chunkIndex, part: partIndex, input: unitInput(context.get(chunk.sectionId) ?? '', text) })
    })
  })
  return units
}
