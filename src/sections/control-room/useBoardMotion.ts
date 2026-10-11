import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react'
import { scheduler } from '../../cluster/scheduler.ts'
import { telemetry } from '../../cluster/telemetry.ts'
import { usePreferences } from '../../components/shell/preferences-context.ts'
import { ARM_THROW_DEG } from './board-art.ts'
import { parseDuration, throwFor } from './board-state.ts'
import type { LampId } from './lamp-positions.ts'
import { detectMotionSensors } from './sensors.ts'

/**
 * The board's motion (spec 4.1). It is event-driven end to end, and there is no render loop:
 *
 *  - the relay arm throws, and the matching cable pulses, inside `scheduler.onMessage`: one throw per real
 *    message, in either direction. Never a timer, and not on ping/pong (the scheduler never reports those),
 *    so an idle system leaves the board perfectly still;
 *  - the cables draw themselves once, at boot (CSS animation, `--dur-boot`), the first time the board is
 *    on screen: below the fold nobody would see it happen;
 *  - nothing runs under lite motion or reduced motion (the final drawing is shown, no listener is added),
 *    and nothing runs while the board is off screen.
 *
 * The throws use the Web Animations API on elements found by `data-arm`, `data-contact` and `data-pulse`,
 * so React never re-renders for a message. Durations and easing are read from the motion tokens.
 */

interface Tokens {
  dur1: number
  dur3: number
  easeRelay: string
  easeOut: string
}

function readTokens(root: Element): Tokens {
  const style = getComputedStyle(root)
  const easing = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    dur1: parseDuration(style.getPropertyValue('--dur-1'), 120),
    dur3: parseDuration(style.getPropertyValue('--dur-3'), 420),
    easeRelay: easing('--ease-relay', 'cubic-bezier(.2,.9,.1,1)'),
    easeOut: easing('--ease-out', 'cubic-bezier(.16,1,.3,1)'),
  }
}

/** Minimum gap between two animations on the same part, so a flood of messages reads as a buzz, not a smear. */
const MIN_GAP_MS = 70

const nowMs = () => performance.now()

function throwRelay(root: Element, direction: 'out' | 'in', tokens: Tokens, last: Map<string, number>) {
  const arm = root.querySelector<SVGGElement>('[data-arm]')
  if (!arm || typeof arm.animate !== 'function') return
  const at = nowMs()
  if (at - (last.get('arm') ?? -Infinity) < MIN_GAP_MS) return
  last.set('arm', at)
  // Positive rotation is clockwise: the arm hangs down, so clockwise swings its tip to the left contact.
  const angle = direction === 'out' ? -ARM_THROW_DEG : ARM_THROW_DEG
  const turn = (deg: number) => `rotate(${deg}deg)`
  const duration = tokens.dur1 * 2.5
  // Attack, hold on the contact, back past rest by a few degrees, settle. There is no 0 % frame, so a throw
  // that arrives while the last one is still running starts from wherever the arm is. The offsets are real
  // time (the animation itself is linear), so the arm sits on its contact for about 60 ms: long enough to see.
  arm.animate(
    [
      { transform: turn(angle), offset: 0.2, easing: tokens.easeRelay },
      { transform: turn(angle), offset: 0.4, easing: 'ease-in-out' },
      { transform: turn(-angle * 0.14), offset: 0.7, easing: 'ease-out' },
      { transform: turn(0) },
    ],
    { duration, easing: 'linear' },
  )
  // The contact the arm lands on sparks while it sits there.
  const contact = root.querySelector<SVGElement>(`[data-contact="${direction}"]`)
  contact?.animate?.([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], { duration, easing: 'linear' })
}

function pulseCable(root: Element, lamp: LampId, direction: 'out' | 'in', tokens: Tokens, last: Map<string, number>) {
  const key = `pulse:${lamp}`
  const at = nowMs()
  if (at - (last.get(key) ?? -Infinity) < MIN_GAP_MS) return
  const pulses = root.querySelectorAll<SVGElement>(`[data-pulse="${lamp}"]`)
  if (pulses.length === 0) return
  last.set(key, at)
  // The pulse path is drawn relay to lamp with pathLength 1: a dash of 0.16 runs from -0.16 to 1.
  const frames =
    direction === 'out'
      ? [{ strokeDashoffset: 0.16, opacity: 1 }, { strokeDashoffset: -1, opacity: 1 }]
      : [{ strokeDashoffset: -1, opacity: 1 }, { strokeDashoffset: 0.16, opacity: 1 }]
  for (const path of pulses) path.animate?.(frames, { duration: tokens.dur3, easing: tokens.easeOut })
}

export interface BoardMotion {
  /** True once the cables should be in the DOM: the board has been seen, or motion is lite. */
  drawn: boolean
}

export function useBoardMotion(rootRef: RefObject<HTMLElement | null>): BoardMotion {
  const { motionLite } = usePreferences()
  const [seen, setSeen] = useState(false)

  // Visibility: tell telemetry where the board is (its frame sampler runs only while it is on screen),
  // note the first time the board is properly in view (that is when the cables draw), and keep the
  // current visibility for the message handler.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    return telemetry.observeBoard(root)
  }, [rootRef])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (typeof IntersectionObserver === 'undefined') {
      // Very old browser: no way to know, so show the finished board.
      queueMicrotask(() => setSeen(true))
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (!entry) return
        root.dataset.visible = entry.isIntersecting && entry.intersectionRatio >= 0.1 ? '1' : '0'
        if (entry.intersectionRatio >= 0.2) setSeen(true)
      },
      { threshold: [0, 0.1, 0.2] },
    )
    observer.observe(root)
    return () => observer.disconnect()
  }, [rootRef])

  // The message handler. Under lite motion it is never attached, so nothing moves.
  useEffect(() => {
    const root = rootRef.current
    if (!root || motionLite) return
    const tokens = readTokens(root)
    if (tokens.dur1 <= 0) return
    const last = new Map<string, number>()
    return scheduler.onMessage((direction, service, message) => {
      if (root.dataset.visible !== '1' || document.hidden) return
      const kind = message.type === 'job' ? message.kind : undefined
      const move = throwFor(direction, service, kind)
      throwRelay(root, move.direction, tokens, last)
      for (const pulse of move.pulses) pulseCable(root, pulse.lamp, pulse.direction, tokens, last)
    })
  }, [rootRef, motionLite])

  return { drawn: seen || motionLite }
}

// ---- SENSORS -----------------------------------------------------------------------------------

const noSubscription = () => () => undefined
let sensorsCache: boolean | undefined

function sensorsSnapshot(): boolean {
  sensorsCache ??= detectMotionSensors({
    DeviceMotionEvent: (window as unknown as { DeviceMotionEvent?: unknown }).DeviceMotionEvent,
    matchMedia: typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : undefined,
    maxTouchPoints: navigator.maxTouchPoints,
    platform: navigator.platform,
  })
  return sensorsCache
}

/** Does this device report motion sensors? False on the server and in the first client render, then the real answer. */
export function useHasMotionSensors(): boolean {
  return useSyncExternalStore(noSubscription, sensorsSnapshot, () => false)
}
