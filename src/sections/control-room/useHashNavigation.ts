import { useEffect } from 'react'
import { goToId, holdOnTarget } from '../../lib/draw/motion.ts'
import { fragmentId, isPlainClick, samePageId, type LinkLike } from './hash-links.ts'

/**
 * Hash navigation on the home page: in-page links and deep links land ON their target, also on a phone.
 *
 * The browser scrolls to an anchor once, to where the target is at that moment, and this page is a lot taller
 * once it is hydrated (and taller again as each service's demo loads when its panel scrolls near) than the
 * HTML that was prerendered: at 360 x 740 a tap on the rail's "Contact", and a visit to `/#contact`, ended
 * about 2,700 px above it. Two things fix that, and both live here because the control room is the first
 * thing on the page, mounts on the home route only, and the home page is the only one that has this problem:
 *
 *  - Links. A click on a link to a fragment of this page (the rail, the service index, the "skip the machine"
 *    list, the colophon) goes through `goToId`: the landing correction the lamps and the p / c keys already
 *    use, which looks again when the scroll has come to rest and goes on until the target is in place, and
 *    which moves focus to the section's heading. The URL still gets its `#fragment` (and a history entry).
 *    So does a change of the fragment the page did not make itself (editing the address, Forward to a section
 *    the visitor left): that is the `hashchange` event, which `pushState` never raises.
 *  - Deep links. After hydration the page jumps to the fragment in the address bar at once (not smoothly: the
 *    browser would have, and nobody should watch a page fly past a dozen demos), then holds it on its target
 *    while the layout settles: every time the document's size changes, and the target has moved, it is put back
 *    in the same frame, before anything is painted. The hold ends the moment the visitor scrolls or presses
 *    a key or taps anything, and in any case 15 seconds after the navigation started.
 *
 * Both halves are in `lib/draw/motion.ts` (`goToId`, `holdOnTarget`), the same landing the lamps and the p / c keys
 * use: one landing at a time (a new link, or Back, ends the one in progress), and a target more than three screens
 * away is jumped to and held instead of scrolled to. Event-driven like the rest of this section: a click, a resize
 * of the document, the visitor's own input. No frame loop.
 */

/** The hold lasts until this long after navigation start (`performance.now()`), unless the visitor takes over first. */
const HOLD_UNTIL_MS = 15_000

/** A reload or a back / forward visit has its scroll position restored by the browser; landing on the hash would undo that. */
function isFreshVisit(): boolean {
  const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  return entry === undefined || entry.type === 'navigate'
}

/** If the address names a section, land on it and hold it there. Returns the function that ends the hold. */
function landOnDeepLink(): (() => void) | undefined {
  const id = fragmentId(window.location.hash)
  if (id === null || performance.now() > HOLD_UNTIL_MS || !isFreshVisit()) return undefined
  const target = document.getElementById(id)
  return target && target.getClientRects().length > 0 ? holdOnTarget(target, HOLD_UNTIL_MS) : undefined
}

/** The parts of a link `samePageId` decides on (the browser has already resolved a relative `href` against the page). */
function describe(link: HTMLAnchorElement): LinkLike {
  return { origin: link.origin, pathname: link.pathname, search: link.search, hash: link.hash, target: link.target, download: link.hasAttribute('download') }
}

/**
 * The id of this page's own section a fragment names, when the page (not the browser) should scroll to it.
 * Two kinds of target stay the browser's: one that takes focus itself (the skip link's <main tabindex="-1">),
 * and one with no box on screen, which is hidden inside something closed (a <details>): only the browser's own
 * fragment navigation opens what hides it.
 */
function sectionFor(id: string | null): string | null {
  if (id === null) return null
  const target = document.getElementById(id)
  return target && !target.hasAttribute('tabindex') && target.getClientRects().length > 0 ? id : null
}

/** Take over clicks on links to this page's own fragments. */
function onClick(event: MouseEvent) {
  if (!isPlainClick(event)) return
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!(link instanceof HTMLAnchorElement)) return
  const id = sectionFor(samePageId(describe(link), window.location))
  if (id === null) return
  event.preventDefault()
  if (window.location.hash !== link.hash) window.history.pushState(null, '', link.hash)
  goToId(id)
}

/** The fragment changed without a click of ours: the address was edited, or the visitor went Back or Forward to a section. */
function onHashChange() {
  const id = sectionFor(fragmentId(window.location.hash))
  if (id !== null) goToId(id)
}

/** Mount once, in the control room (the first thing on the home page). */
export function useHashNavigation(): void {
  useEffect(() => {
    document.addEventListener('click', onClick)
    window.addEventListener('hashchange', onHashChange)
    const release = landOnDeepLink()
    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('hashchange', onHashChange)
      release?.()
    }
  }, [])
}
