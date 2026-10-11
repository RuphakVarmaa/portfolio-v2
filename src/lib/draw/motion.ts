import type { gsap as GsapCore } from 'gsap'
import type { Flip as FlipPlugin } from 'gsap/Flip'

/**
 * Motion helpers. GSAP is used for exactly three things (spec 2.4): the boot self-draw, `Flip` for the
 * depth switch, and the meter needle. It is ~38 KB gzipped, which would blow the 95 KB initial-JS
 * budget next to React, so it is loaded on demand (`loadGsap`) and never imported statically.
 *
 * "Lite" = `html[data-motion='lite']`, which the pre-paint script also sets for prefers-reduced-motion.
 */

export interface GsapKit {
  gsap: typeof GsapCore
  Flip: typeof FlipPlugin
}

let kit: GsapKit | null = null
let loading: Promise<GsapKit> | null = null

/** Load GSAP core + Flip once. Resolves immediately on later calls. */
export function loadGsap(): Promise<GsapKit> {
  if (kit) return Promise.resolve(kit)
  loading ??= Promise.all([import('gsap'), import('gsap/Flip')]).then(([core, flip]) => {
    core.gsap.registerPlugin(flip.Flip)
    kit = { gsap: core.gsap, Flip: flip.Flip }
    return kit
  })
  return loading
}

/** The loaded kit, or null if `loadGsap()` has not resolved yet. Use for "animate if ready, else just do it". */
export function getGsap(): GsapKit | null {
  return kit
}

/** True when motion should be skipped: `data-motion='lite'` (set for reduced-motion too). False on the server. */
export function isLite(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.motion === 'lite'
}

export interface SelfDrawOptions {
  /** Seconds. Spec: 0.9. */
  duration?: number
  /** Seconds between elements. Spec: 0.09. */
  stagger?: number
  onComplete?: () => void
}

function clearDraw(paths: readonly SVGGeometryElement[]) {
  for (const path of paths) {
    path.style.strokeDasharray = ''
    path.style.strokeDashoffset = ''
    path.removeAttribute('pathLength')
  }
}

/**
 * Plotter-style self-draw: animates `stroke-dashoffset` from "undrawn" to "drawn" with core `gsap.to`
 * (DrawSVG is a Club plugin and is not used). Works on any SVG path/line without measuring it, by
 * normalizing every element to `pathLength="1"`. Under lite motion (or if GSAP cannot load) nothing
 * animates: the final drawing is left in place and `onComplete` fires. Returns a cancel function.
 */
export function selfDraw(elements: ArrayLike<SVGGeometryElement>, options: SelfDrawOptions = {}): () => void {
  const paths = Array.from(elements)
  const { duration = 0.9, stagger = 0.09, onComplete } = options
  if (paths.length === 0 || isLite()) {
    clearDraw(paths)
    onComplete?.()
    return () => undefined
  }
  for (const path of paths) {
    path.setAttribute('pathLength', '1')
    path.style.strokeDasharray = '1'
    path.style.strokeDashoffset = '1'
  }
  let cancelled = false
  let tween: { kill(): void } | null = null
  loadGsap().then(
    ({ gsap }) => {
      if (cancelled) return
      tween = gsap.to(paths, {
        strokeDashoffset: 0,
        duration,
        stagger,
        ease: 'expo.out',
        onComplete: () => {
          clearDraw(paths)
          onComplete?.()
        },
      })
    },
    () => {
      clearDraw(paths)
      onComplete?.()
    },
  )
  return () => {
    cancelled = true
    tween?.kill()
    clearDraw(paths)
  }
}

/** How far (px) the target may sit from where `scroll-padding-top` puts it before a smooth scroll is judged to have stopped short. */
const LANDING_TOLERANCE = 24
/** Sub-pixel rounding is not a miss when a held target is put back. */
const HOLD_TOLERANCE = 2
/**
 * A target further away than this many viewport heights is jumped to, not scrolled to. A smooth scroll that long
 * passes every panel on the way, and each demo loads as its panel comes near: seconds of a page flying past a dozen
 * demos, and a page that keeps growing under the scroll.
 */
const FAR_SCREENS = 3
/** How long a jump holds its target in place while the layout settles, unless the visitor takes over first (ms). */
const HOLD_MS = 6000
/**
 * Anything that means "someone else is steering now": the visitor scrolls, taps or presses a key, or the address
 * changed to name another place (Back, Forward, an edited fragment). A landing in progress steps aside.
 */
const TAKEOVER_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'hashchange'] as const

/** Ends the landing in progress (a smooth scroll being watched, or a jump being held), if there is one. */
let endLanding: (() => void) | null = null

/** Where `scroll-padding-top` puts a scrolled-to element: just under the sticky header. */
function scrollPaddingTop(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
}

/** Run `scroll` with `scroll-behavior: auto`, whatever the stylesheet says: this is a jump, not a movement to watch. */
function instantly(scroll: () => void) {
  const root = document.documentElement
  const before = root.style.scrollBehavior
  root.style.scrollBehavior = 'auto'
  scroll()
  root.style.scrollBehavior = before
}

/**
 * Put `target` where `scroll-padding-top` wants it, now and whenever the document's size changes, until the visitor
 * takes over or `deadline` (a `performance.now()` time) has passed. Returns the function that ends the hold.
 *
 * The page is a lot taller once it is hydrated, and taller again as each service's demo loads when its panel comes
 * near, than the HTML that was prerendered: a jump to a section lands where the section was a moment ago, and the
 * page grows above it afterwards. A resize observer reports after layout and before paint, so a correction made in
 * it is never seen. Event-driven: no timer except the one that arms the visitor's own input.
 */
export function holdOnTarget(target: HTMLElement, deadline: number): () => void {
  let released = false
  const align = () => {
    if (!target.isConnected) return
    const miss = target.getBoundingClientRect().top - scrollPaddingTop()
    if (Math.abs(miss) > HOLD_TOLERANCE) instantly(() => window.scrollBy(0, miss))
  }
  const release = () => {
    if (released) return
    released = true
    clearTimeout(armTimer)
    observer.disconnect()
    for (const type of TAKEOVER_EVENTS) window.removeEventListener(type, release)
  }
  const observer = new ResizeObserver(() => (performance.now() > deadline ? release() : align()))
  observer.observe(document.documentElement)
  // Armed on the next task, not now: this may be running inside the key press that started the jump, and that very
  // event must not count as the visitor taking over.
  const armTimer = setTimeout(() => {
    for (const type of TAKEOVER_EVENTS) window.addEventListener(type, release, { passive: true })
  }, 0)
  align()
  return release
}

/**
 * Scroll to an element by id and move focus to its heading (`[data-panel-heading]`, or the first heading) so
 * keyboard and screen-reader users land where the page scrolled.
 *
 * A near target is scrolled to smoothly (instant under lite motion). A smooth `scrollIntoView` chooses its end
 * point once, at the start, and the services' demos load lazily as their panels come into view, so the page can
 * grow underneath the scroll and the target moves further down: it stopped 900 px short of #contact on a laptop and
 * more than 2,000 px short on a phone. So once the scroll has come to rest, look where the target actually is and
 * go again until it is in place. A far target (more than three screens away), and any target under lite motion, is
 * jumped to at once and held there while the layout settles (`holdOnTarget`).
 *
 * One landing at a time: a new call, and a change of the address, ends the one before (pressing Back during a
 * landing used to finish on the old target while the address named the new one).
 */
export function goToId(id: string): boolean {
  if (typeof document === 'undefined') return false
  const target = document.getElementById(id)
  if (!target) return false
  endLanding?.()
  endLanding = null
  const far = Math.abs(target.getBoundingClientRect().top - scrollPaddingTop()) > FAR_SCREENS * window.innerHeight
  if (isLite() || far) {
    instantly(() => target.scrollIntoView({ block: 'start' }))
    endLanding = holdOnTarget(target, performance.now() + HOLD_MS)
  } else {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    endLanding = landOn(target, 5)
  }
  const heading = target.querySelector<HTMLElement>('[data-panel-heading], h1, h2, h3')
  heading?.focus({ preventScroll: true })
  return true
}

/** Watch a smooth scroll to rest, then correct it if it stopped short. Gives up the moment the visitor scrolls or the address changes. Returns the function that ends it. */
function landOn(target: HTMLElement, retries: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const finish = () => {
    clearTimeout(timer)
    clearTimeout(armTimer)
    for (const type of TAKEOVER_EVENTS) window.removeEventListener(type, finish)
  }
  // Armed on the next task, not now: this runs inside the key press or click that started the scroll, and that very
  // event must not count as the visitor taking over.
  const armTimer = setTimeout(() => {
    for (const type of TAKEOVER_EVENTS) window.addEventListener(type, finish, { passive: true })
  }, 0)

  let lastY = -1
  let still = 0
  const watch = () => {
    if (!target.isConnected) return finish()
    // `scrollend` is not in every supported browser (Safari 16.4), so rest is "the scroll position did not change for 200 ms".
    still = window.scrollY === lastY ? still + 1 : 0
    lastY = window.scrollY
    if (still < 2) {
      timer = setTimeout(watch, 100)
      return
    }
    finish()
    if (retries > 0 && Math.abs(target.getBoundingClientRect().top - scrollPaddingTop()) > LANDING_TOLERANCE) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      endLanding = landOn(target, retries - 1)
    }
  }
  timer = setTimeout(watch, 100)
  return finish
}
