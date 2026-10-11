/**
 * Keep the visitor's place on the page when an answer is inserted above what they are looking at.
 *
 * "Show me the pipeline" sits below the demo, so the answer it triggers is inserted above the button the visitor
 * just pressed. Browsers that have scroll anchoring (Chrome, Firefox) are meant to hold the page still, but the
 * demo swaps whole blocks of markup in and out, and an anchor that is removed cannot compensate; Safari has no
 * scroll anchoring at all. So the demo does it itself, by comparing positions rather than guessing deltas:
 *
 *   before it asks:    `placeToHold` records where the element that follows the demo is, but only when the place
 *                      where answers are inserted (the bottom of the question and its suggestions) is above the
 *                      viewport: the visitor is looking at what is below it, and all of that is about to move;
 *   after each commit: `scrollToRestore` says how far the page has to move for that element to be back where it
 *                      was. If the browser already compensated, the answer is 0, so nothing is ever applied twice.
 *
 * Typing a question never triggers it: then the question is on screen. Pure functions here; the layout reads and
 * the scroll call are in AskTheSite.tsx.
 */

/** The element after the demo in the panel (the always-visible honest caption), or null when the demo is not in a panel. */
export function elementAfter(demo: Element): Element | null {
  return demo.closest('[data-flip]')?.nextElementSibling ?? null
}

/**
 * The viewport top to hold, or null when nothing needs holding. `insertionBottom` is the bottom edge of the part
 * of the demo above where answers appear; `referenceTop` the top edge of the element after the demo (it moves
 * with everything the visitor can see below the insertion point, whether or not it is on screen itself).
 */
export function placeToHold(insertionBottom: number | undefined, referenceTop: number | undefined): number | null {
  return insertionBottom !== undefined && insertionBottom < 0 && referenceTop !== undefined ? referenceTop : null
}

/** How many pixels to scroll so the reference is back at `held` (0 when it already is, or when nothing is held). */
export function scrollToRestore(held: number | null, referenceTop: number): number {
  if (held === null) return 0
  const delta = referenceTop - held
  return Math.abs(delta) < 0.5 ? 0 : delta
}
