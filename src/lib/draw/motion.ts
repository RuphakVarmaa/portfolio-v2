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

/** How far (px) the target may sit from where `scroll-padding-top` puts it before a scroll is judged to have stopped short. */
const LANDING_TOLERANCE = 24
/** Anything the visitor does with the page that means "I am scrolling now": the programmatic scroll steps aside. */
const TAKEOVER_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

/**
 * Smooth-scroll to an element by id and move focus to its heading (`[data-panel-heading]`, or the first
 * heading) so keyboard and screen-reader users land where the page scrolled. Instant under lite motion.
 *
 * A smooth `scrollIntoView` chooses its end point once, at the start. The services' demos are loaded lazily as
 * their panels come into view, so while a long scroll runs the page grows underneath it and the target moves
 * further down: the scroll stopped 900 px short of #contact on a laptop and more than 2,000 px short on a phone.
 * So once the scroll has come to rest, look where the target actually is and go again until it is in place.
 */
export function goToId(id: string): boolean {
  if (typeof document === 'undefined') return false
  const target = document.getElementById(id)
  if (!target) return false
  const smooth = !isLite()
  target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  const heading = target.querySelector<HTMLElement>('[data-panel-heading], h1, h2, h3')
  heading?.focus({ preventScroll: true })
  if (smooth) landOn(target, 5)
  return true
}

/** Watch a smooth scroll to rest, then correct it if it stopped short. Gives up the moment the visitor scrolls. */
function landOn(target: HTMLElement, retries: number) {
  let visitorTookOver = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const takeOver = () => {
    visitorTookOver = true
  }
  // Armed on the next task, not now: this runs inside the key press or click that started the scroll, and that very
  // event must not count as the visitor taking over.
  const armTimer = setTimeout(() => {
    for (const type of TAKEOVER_EVENTS) window.addEventListener(type, takeOver, { passive: true })
  }, 0)
  const finish = () => {
    clearTimeout(timer)
    clearTimeout(armTimer)
    for (const type of TAKEOVER_EVENTS) window.removeEventListener(type, takeOver)
  }

  let lastY = -1
  let still = 0
  const watch = () => {
    if (visitorTookOver || !target.isConnected) return finish()
    // `scrollend` is not in every supported browser (Safari 16.4), so rest is "the scroll position did not change for 200 ms".
    still = window.scrollY === lastY ? still + 1 : 0
    lastY = window.scrollY
    if (still < 2) {
      timer = setTimeout(watch, 100)
      return
    }
    finish()
    const wanted = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
    if (retries > 0 && Math.abs(target.getBoundingClientRect().top - wanted) > LANDING_TOLERANCE) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      landOn(target, retries - 1)
    }
  }
  timer = setTimeout(watch, 100)
}
