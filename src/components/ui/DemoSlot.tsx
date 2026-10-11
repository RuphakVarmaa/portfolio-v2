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

  // Always sees the latest `load`, so an inline `() => import(...)` does not restart the observer on every render.
  const begin = useEffectEvent(() => {
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
    return () => observer.disconnect()
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
