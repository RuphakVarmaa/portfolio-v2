import { useCallback, useEffect, useState } from 'react'

/**
 * Load what holds tab stops before the keyboard gets there, not when the viewport does.
 *
 * DemoSlot (F) starts a lazy piece when its slot is near the viewport. For a mouse or a finger that is the
 * right moment. For the keyboard it is too late: Tab moves focus to the next focusable element in the page,
 * and a piece that has not loaded yet has none, so focus walks past it and the piece appears behind the
 * focus point (seen on the home page: forward Tab went from Review straight to Deploy History and never
 * visited the Chaos Lab). The first Tab key press anywhere on the page is the earliest sign that the visitor
 * navigates by keyboard, so that is the moment these pieces start loading: seconds before focus can reach one.
 */

/**
 * DemoSlot's `rootMargin` that means "start now": an IntersectionObserver margin so wide that the slot counts
 * as in view wherever it is on the page.
 *
 * DemoSlot now starts every idle slot on the first Tab key press itself (components/ui/DemoSlot.tsx), which is
 * the same moment this hook wakes on, so a keyboard walk no longer depends on this file. What the stand-in
 * buttons still need from here is `wake()` (a focus or a press on one starts the load at once, wherever the
 * visitor is), which this margin makes DemoSlot's observer treat as "in view".
 */
export const START_NOW = '100000px 0px'

/**
 * `woken` turns true once and stays true: on the first Tab key press (checked in the capture phase, so a
 * control that stops the event still counts), or when `wake()` is called (the section's own stand-in
 * controls call it when they are focused or pressed). While `enabled` is false nothing is listened for.
 */
export function useWake(enabled = true): readonly [woken: boolean, wake: () => void] {
  const [woken, setWoken] = useState(false)
  const wake = useCallback(() => setWoken(true), [])

  useEffect(() => {
    if (!enabled || woken) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') setWoken(true)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [enabled, woken])

  return [woken, wake]
}
