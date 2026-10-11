/**
 * Citations that land: take the sentence a hit cites, find that exact text on the page, scroll to it, give it
 * focus for assistive technology, and underline it for four seconds (spec 4.3: `.cited`, 2 px `--live`).
 *
 * The page is rendered by React; this file only reads it, adds the `cited` class and a CSS Custom Highlight,
 * and removes both again. It never writes text into the page.
 *
 * Matching ignores whitespace on both sides, because the page's markup puts no space between things the
 * corpus joined with one (a metric's value and its label sit in two spans). The text of the retrieval demo
 * itself is skipped, or the cited sentence would be found in its own result card first.
 *
 * `findSquashed` is the pure part (tested in Node); the rest needs a DOM and is called from event handlers only.
 */

/** Where a match starts and ends, as (text index, offset) pairs into a list of text pieces. */
export interface SquashedMatch {
  startText: number
  startOffset: number
  endText: number
  /** Offset just after the last matched character. */
  endOffset: number
}

const squash = (text: string): string => text.replace(/\s+/g, '')

/**
 * Find `needle` in the concatenation of `texts` with every whitespace character removed from both. Returns
 * where it starts and ends in terms of the original pieces, so a DOM Range can be built from the result.
 * A needle that is not found whole is retried with its first and then its last 60 characters, which finds a
 * sentence the page has wrapped in inline markup or only partly shows.
 */
export function findSquashed(texts: readonly string[], needle: string): SquashedMatch | null {
  let hay = ''
  const pieceOf: number[] = []
  const offsetOf: number[] = []
  texts.forEach((text, piece) => {
    for (let offset = 0; offset < text.length; offset++) {
      if (/\s/.test(text[offset])) continue
      hay += text[offset]
      pieceOf.push(piece)
      offsetOf.push(offset)
    }
  })
  const whole = squash(needle)
  if (whole === '') return null
  for (const candidate of [whole, whole.slice(0, 60), whole.slice(-60)]) {
    if (candidate.length < Math.min(24, whole.length)) continue
    const at = hay.indexOf(candidate)
    if (at < 0) continue
    const last = at + candidate.length - 1
    return { startText: pieceOf[at], startOffset: offsetOf[at], endText: pieceOf[last], endOffset: offsetOf[last] + 1 }
  }
  return null
}

/** True where `text[i]` ends a sentence: `.`, `!` or `?` (and any closing quote or bracket) followed by whitespace or the end. */
function endsSentence(text: string, i: number): boolean {
  if (!/[.!?]/.test(text[i])) return false
  let next = i + 1
  while (next < text.length && /["')\]]/.test(text[next])) next += 1
  return next >= text.length || /\s/.test(text[next])
}

/**
 * Widen `[from, to)` inside one text to whole sentences. A window of the corpus can end in the middle of a
 * sentence, so the sentence a hit cites may be only its tail; on the page the underline should cover the whole
 * sentence. A range that already is whole sentences comes back unchanged. Works inside one text node (inline
 * markup that splits a sentence keeps the part found).
 */
export function expandToSentence(text: string, from: number, to: number): { from: number; to: number } {
  let start = from
  while (start > 0 && !endsSentence(text, start - 1)) start -= 1
  // Step over what separates the sentences: whitespace and the closing quote or bracket of the one before.
  while (start < from && /[\s"')\]]/.test(text[start])) start += 1
  let end = to
  if (end > 0 && !endsSentence(text, end - 1)) {
    while (end < text.length && !endsSentence(text, end)) end += 1
    if (end < text.length) {
      end += 1
      while (end < text.length && /["')\]]/.test(text[end])) end += 1
    }
  }
  return { from: start, to: end }
}

// ---- the DOM half ---------------------------------------------------------------------------------------------

const CITED_CLASS = 'cited'
const HIGHLIGHT = 'quorum-cited'
const DURATION_MS = 4000
/** Text inside these is not "the page": code, hidden things, dialogs, and the demo's own result cards. */
const SKIP = 'script, style, dialog, svg, [data-retrieval-demo]'
const BLOCK = 'p, li, dd, dt, h1, h2, h3, h4, h5, h6, figcaption, summary, button, td'

export type CitationOutcome = 'sentence' | 'section' | 'missing'

interface HighlightRegistry {
  set(name: string, highlight: unknown): void
  delete(name: string): void
}

let timer: ReturnType<typeof setTimeout> | undefined
let marked: HTMLElement | null = null

function highlights(): HighlightRegistry | null {
  const registry = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights
  const Highlight = (globalThis as { Highlight?: unknown }).Highlight
  return registry && typeof Highlight === 'function' ? registry : null
}

/** Take the underline off. Safe to call any time. */
export function clearCitation(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
  marked?.classList.remove(CITED_CLASS)
  marked = null
  highlights()?.delete(HIGHLIGHT)
}

function textNodes(root: HTMLElement): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) out.push(node as Text)
  return out
}

/** Open any closed <details> around a node (a release's note sits in one), then say whether the range is on screen. */
function openAncestors(node: Node): void {
  for (let element = node.parentElement; element; element = element.parentElement) {
    if (element instanceof HTMLDetailsElement && !element.open) element.open = true
  }
}

function blockOf(range: Range): HTMLElement | null {
  const start = range.commonAncestorContainer
  const element = start instanceof HTMLElement ? start : start.parentElement
  return element?.closest<HTMLElement>(BLOCK) ?? element
}

function show(element: HTMLElement, lite: boolean): void {
  element.scrollIntoView({ behavior: lite ? 'auto' : 'smooth', block: 'center' })
  // Focus the passage so a screen reader reads it and the next Tab continues from there.
  const hadTabindex = element.hasAttribute('tabindex')
  if (!hadTabindex) element.setAttribute('tabindex', '-1')
  element.focus({ preventScroll: true })
  if (!hadTabindex) element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true })
}

/**
 * Show where `sentence` sits inside `#anchor`. Returns what it managed:
 *   'sentence'  found, scrolled to, underlined (the paragraph gets `.cited`; where the browser supports the
 *               CSS Custom Highlight API the sentence itself also gets a soft band)
 *   'section'   the sentence is not on the page right now (a hidden depth, a different layout), so the section's
 *               heading is scrolled to and underlined instead
 *   'missing'   no element with that id on this page (a /projects/ page citing another section): the caller navigates
 */
export function showCitation(anchor: string, sentence: string, lite: boolean): CitationOutcome {
  clearCitation()
  const root = document.getElementById(anchor)
  if (!root) return 'missing'

  const nodes = textNodes(root)
  const match = findSquashed(nodes.map((node) => node.data), sentence)
  if (match) {
    const range = document.createRange()
    // Widen to whole sentences within the text nodes the match starts and ends in (a window can cut a sentence).
    const first = nodes[match.startText]
    const last = nodes[match.endText]
    const startAt = match.startText === match.endText ? expandToSentence(first.data, match.startOffset, match.endOffset) : expandToSentence(first.data, match.startOffset, first.data.length)
    const endAt = match.startText === match.endText ? startAt : expandToSentence(last.data, 0, match.endOffset)
    range.setStart(first, startAt.from)
    range.setEnd(last, endAt.to)
    openAncestors(range.startContainer)
    const element = blockOf(range)
    if (element && range.getClientRects().length > 0) {
      element.classList.add(CITED_CLASS)
      marked = element
      const registry = highlights()
      if (registry) {
        const Highlight = (globalThis as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight
        registry.set(HIGHLIGHT, new Highlight(range))
      }
      timer = setTimeout(clearCitation, DURATION_MS)
      show(element, lite)
      return 'sentence'
    }
  }

  const heading = root.querySelector<HTMLElement>('[data-panel-heading], h1, h2, h3') ?? root
  heading.classList.add(CITED_CLASS)
  marked = heading
  timer = setTimeout(clearCitation, DURATION_MS)
  show(heading, lite)
  return 'section'
}
