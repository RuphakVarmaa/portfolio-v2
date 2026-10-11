/**
 * The hand-over from the stand-in controls to the live bench.
 *
 * Until the live Chaos Lab arrives (it is a lazy chunk), the section shows stand-ins for its two buttons, so
 * the lab is in the keyboard tab order from the first moment and a visitor who gets there first is not passed
 * over. When the live bench replaces them, two things would be lost: the focus (the stand-in that held it is
 * removed, so focus falls back to the top of the page) and a press that came too early. This module carries
 * both across:
 *
 *  - the stand-in section tells it which stand-in held focus as the section was replaced (`rememberFocus`) and
 *    which one was pressed (`rememberPress`)
 *  - the live bench, as it mounts, asks what to finish (`takeHandoff`): focus goes to the live button with the
 *    same name, and a press is replayed as a click on it, so the experiment the visitor asked for runs once
 *
 * Nothing is remembered for long: a press or a focus older than STALE_MS belongs to a visitor who has long
 * since moved on, and is dropped. No DOM here (the caller finds the buttons), so `node --test` covers it.
 */

/** The two buttons the stand-ins mirror. The third experiment (close the leader) has no button. */
export type LabKey = 'plug' | 'tab'

export const isLabKey = (value: unknown): value is LabKey => value === 'plug' || value === 'tab'

/** The stand-in and the live button carry the same `data-chaos-key`, which is how one finds the other. */
export const LAB_KEY_ATTRIBUTE = 'data-chaos-key'

/** How long a remembered focus or press may wait for the live bench (a slow network can take seconds). */
export const STALE_MS = 20_000

/** The part of a DOM element `heldKey` reads: a stand-in is found by its `data-chaos-key`. */
export interface KeyedElement {
  getAttribute(name: string): string | null
}

/**
 * The key of the stand-in that holds focus inside `frame`: `active` is the focused element, `frame` the stand-in
 * section it may be in. Null when focus is elsewhere, on nothing, or on an element that is no stand-in.
 */
export function heldKey<E extends KeyedElement>(frame: { contains(node: E): boolean }, active: E | null): LabKey | null {
  if (active === null || !frame.contains(active)) return null
  const key = active.getAttribute(LAB_KEY_ATTRIBUTE)
  return isLabKey(key) ? key : null
}

interface Memory {
  focused: LabKey | null
  focusedAt: number
  pressed: LabKey | null
  pressedAt: number
}

const NOTHING: Memory = { focused: null, focusedAt: 0, pressed: null, pressedAt: 0 }
let memory: Memory = NOTHING

/** The stand-in section is being replaced; `key` is the stand-in that held focus at that moment, if any. */
export function rememberFocus(key: LabKey | null, now: number = performance.now()): void {
  memory = { ...memory, focused: key, focusedAt: now }
}

/** A stand-in was pressed before the live bench was there to take the press. */
export function rememberPress(key: LabKey, now: number = performance.now()): void {
  memory = { ...memory, pressed: key, pressedAt: now }
}

export interface Handoff {
  /** The live button that should take focus, or null. */
  focus: LabKey | null
  /** The live button that should be pressed now (a stand-in was pressed before the bench was ready), or null. */
  press: LabKey | null
}

export interface TakeOptions {
  now: number
  /** Focus is on nothing (`document.body`): the stand-in that held it is gone. If it is anywhere else, the visitor moved on and focus is left alone. */
  focusLost: boolean
}

/**
 * Called once by the live bench as it mounts: what to do for the visitor who began on the stand-ins. Focus goes
 * back to the live twin of the stand-in that held it (only if focus is really lost); a press is replayed on the
 * live twin of the stand-in that was pressed. Everything remembered is forgotten here, so a second mount (the
 * machine switched off and on again) never replays it.
 */
export function takeHandoff({ now, focusLost }: TakeOptions): Handoff {
  const { focused, focusedAt, pressed, pressedAt } = memory
  memory = NOTHING
  const press = pressed !== null && now - pressedAt <= STALE_MS ? pressed : null
  const held = focused !== null && now - focusedAt <= STALE_MS ? focused : null
  return { focus: focusLost ? (held ?? press) : null, press }
}
