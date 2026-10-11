/**
 * In-page links and deep links (the Quick-view rail's `/#contact`, the service index's `#service-vision`,
 * `https://www.ruphak.me/#contact` typed or shared): which clicks the page takes over, and which fragment a
 * link or the address bar names. Pure functions, so `node --test` can pin them; `useHashNavigation.ts` does
 * the scrolling.
 *
 * Why the page takes them over at all: the browser jumps to an anchor once, at the position the target has
 * at that moment, and the home page is much taller after hydration (and again as each service's demo loads
 * when its panel scrolls near) than the HTML that was prerendered. On a phone the native jump ended 2,700 px
 * short of #contact. Routed through `goToId` (the landing correction the lamps and the p / c keys use), the
 * same links land on the target.
 *
 * Plain `.ts` on purpose (no JSX, no DOM types needed beyond the plain fields below).
 */

/** The fields of an `<a>` (`HTMLAnchorElement`) the decision reads; the resolved URL parts, so a relative `href` is already absolute. */
export interface LinkLike {
  origin: string
  pathname: string
  search: string
  hash: string
  /** `target="_blank"` and friends. */
  target: string
  /** `download` attribute present. */
  download: boolean
}

/** The fields of `location` the decision reads. */
export interface PageLike {
  origin: string
  pathname: string
  search: string
}

/** The fields of a click the decision reads. */
export interface ClickLike {
  defaultPrevented: boolean
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** A plain primary-button click: not already handled, no modifier (those open a new tab or window, or download). */
export function isPlainClick(event: ClickLike): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

/** `#contact` -> `contact`; the empty fragment, a lone `#` and a malformed escape (`#%E0%A4`) name nothing. */
export function fragmentId(hash: string): string | null {
  if (hash.length < 2 || hash[0] !== '#') return null
  try {
    return decodeURIComponent(hash.slice(1))
  } catch {
    return null
  }
}

/**
 * The id a link points at on this very page, or `null` when the browser should follow it itself: a link to
 * another page or origin, one that opens elsewhere (`target="_blank"`) or downloads, or one with no fragment.
 */
export function samePageId(link: LinkLike, page: PageLike): string | null {
  if (link.origin !== page.origin || link.pathname !== page.pathname || link.search !== page.search) return null
  if (link.download || (link.target !== '' && link.target !== '_self')) return null
  return fragmentId(link.hash)
}
