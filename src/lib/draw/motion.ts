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

/**
 * Smooth-scroll to an element by id and move focus to its heading (`[data-panel-heading]`, or the first
 * heading) so keyboard and screen-reader users land where the page scrolled. Instant under lite motion.
 */
export function goToId(id: string): boolean {
  if (typeof document === 'undefined') return false
  const target = document.getElementById(id)
  if (!target) return false
  target.scrollIntoView({ behavior: isLite() ? 'auto' : 'smooth', block: 'start' })
  const heading = target.querySelector<HTMLElement>('[data-panel-heading], h1, h2, h3')
  heading?.focus({ preventScroll: true })
  return true
}
