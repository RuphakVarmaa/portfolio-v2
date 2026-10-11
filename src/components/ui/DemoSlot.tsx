import { Component, useEffect, useEffectEvent, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { copy } from '../../data/copy.ts'
import { useDemoFallback } from './panel-context.ts'
import styles from './ui.module.css'

export interface DemoSlotProps<P extends object> {
  /** The dynamic import of the demo module: `() => import('./AskTheSite.tsx')`. Its default export is the demo component. */
  load: () => Promise<{ default: ComponentType<P> }>
  /** Props passed to the demo component once loaded. */
  props?: P
  /** Static content shown on the server, before the panel is near the viewport, and if loading fails. Defaults to the ServicePanel's `fallback`. */
  fallback?: ReactNode
  /** Never load the demo (e.g. no Worker support): the fallback stays. */
  disabled?: boolean
  /** When to start loading, as an IntersectionObserver margin. Spec 4.2: within 50 % of the viewport. */
  rootMargin?: string
}

interface BoundaryProps {
  fallback: ReactNode
  children: ReactNode
}

class DemoBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

type Status = 'idle' | 'loading' | 'ready' | 'failed'

/**
 * Every slot that has not started loading, so that one key press can start them all.
 *
 * The viewport is the right moment to load a demo for a mouse or a finger. For the keyboard it is too late: Tab moves
 * focus to the next focusable element on the page, and a demo that has not loaded yet has none (its fallback is
 * static), so focus walks past it and the demo appears behind the focus point. A forward Tab walk on the home page
 * went from the Review panel straight to the Deploy History, past the Chaos Lab. The first Tab key press anywhere is
 * the earliest sign that the visitor navigates by keyboard, so it starts every idle slot at once, seconds before focus
 * can reach one. (Mouse and touch visitors never press Tab, and load nothing they have not scrolled near.)
 */
const idleSlots = new Set<() => void>()
let watchingTab = false

function watchForTab() {
  if (watchingTab || typeof document === 'undefined') return
  watchingTab = true
  // The capture phase, so a control that stops the event still counts.
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return
    document.removeEventListener('keydown', onKey, true)
    watchingTab = false
    for (const start of [...idleSlots]) start()
  }
  document.addEventListener('keydown', onKey, true)
}

/**
 * Lazy-loads a service's interactive demo. Until the panel is within 50 % of the viewport the slot
 * renders the static fallback (which is also what the prerendered HTML contains), then it imports the
 * demo chunk and swaps it in. Model and runtime bytes are never loaded here: the demo itself decides
 * whether to wait for a tap.
 */
export function DemoSlot<P extends object>({ load, props, fallback, disabled = false, rootMargin = '50% 0px' }: DemoSlotProps<P>) {
  const ref = useRef<HTMLDivElement>(null)
  const panelFallback = useDemoFallback()
  const shown = fallback ?? panelFallback
  const [status, setStatus] = useState<Status>('idle')
  const [Demo, setDemo] = useState<ComponentType<P> | null>(null)
  const started = useRef(false)

  // Always sees the latest `load`, so an inline `() => import(...)` does not restart the observer on every render.
  const begin = useEffectEvent(() => {
    // The viewport and the first Tab key press can both ask: the demo is imported once.
    if (started.current) return
    started.current = true
    setStatus('loading')
    load().then(
      (module) => {
        setDemo(() => module.default)
        setStatus('ready')
      },
      () => setStatus('failed'),
    )
  })

  useEffect(() => {
    if (disabled || status !== 'idle') return
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') {
      queueMicrotask(begin)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          begin()
        }
      },
      { rootMargin },
    )
    observer.observe(element)
    const start = () => begin()
    idleSlots.add(start)
    watchForTab()
    return () => {
      observer.disconnect()
      idleSlots.delete(start)
    }
  }, [disabled, status, rootMargin])

  return (
    <div ref={ref} className={styles.demoSlot} data-demo-slot="" data-status={status} aria-busy={status === 'loading' || undefined}>
      {status === 'ready' && Demo ? (
        <DemoBoundary fallback={shown}>
          <Demo {...(props as P)} />
        </DemoBoundary>
      ) : (
        <>
          {shown}
          {status === 'failed' ? <p className={styles.demoNote}>{copy.services.panel.demoFailed}</p> : null}
        </>
      )}
    </div>
  )
}
