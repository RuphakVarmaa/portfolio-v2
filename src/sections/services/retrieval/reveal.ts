/**
 * Bring a new answer into view when it lands.
 *
 * A visitor asks from the question box or a chip near the top of the demo, and the answer is inserted below them. On a
 * phone, or in a short window, that is below the fold: they press "Ask" and see nothing happen. After a question the
 * page therefore scrolls, by the least it takes, until the start of the answer (its label, the question, the best card's
 * header, its passage and the link that finds it) is on screen. It never moves the page when the start of the answer is already
 * visible, never moves it further than putting the answer's label at the top, and leaves the keyboard focus where it is.
 *
 * Pure: the numbers come from `getBoundingClientRect` and the viewport, and the caller does the scrolling.
 */

/** How much of the answer should be on screen once it has landed, px: the label, the question, the best card's header, its passage and the link that finds it on the page. */
export const FIRST_SCREEN = 480
/** Room left above the answer's label when the page has to move, px. */
const AIR = 16
/** Room left under the link that finds the passage, px. */
const UNDER_LINK = 12

/** The part of the viewport that nothing sticky covers, in viewport pixels (the header at the top, the status strip at the bottom). */
export interface Room {
  top: number
  bottom: number
}

/**
 * How much of the answer has to be on screen: the first screenful at least, and down to the best card's "Find it on this
 * page" link when it is lower than that (a passage is more or fewer lines, and a phone wraps them). `linkBottom` is the link's
 * bottom edge and `answerTop` the answer's top edge, both as `getBoundingClientRect` reports them; null when there is no link.
 */
export function firstScreenFor(linkBottom: number | null, answerTop: number): number {
  return linkBottom === null ? FIRST_SCREEN : Math.max(FIRST_SCREEN, Math.ceil(linkBottom - answerTop) + UNDER_LINK)
}

/**
 * How many pixels to scroll (positive: down the page; negative: up; 0: not at all) so the start of an answer is in `room`.
 * `box` is the answer's rectangle as `getBoundingClientRect` reports it.
 */
export function revealDelta(box: { top: number; height: number }, room: Room, first: number = FIRST_SCREEN): number {
  // Behind the header, or above the screen: bring it down to the top of the room.
  if (box.top < room.top) return box.top - (room.top + AIR)
  // Its first screenful has to end inside the room (a short answer needs only its own height).
  const overflow = box.top + Math.min(box.height, first) - room.bottom
  if (overflow <= 0) return 0
  // Move up by that much, but not past the point where the label sits at the top of the room: the visitor's question goes off screen, not the answer.
  return Math.min(overflow, Math.max(0, box.top - (room.top + AIR)))
}
