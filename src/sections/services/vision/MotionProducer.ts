/**
 * The motion producer (spec 4.4): on a phone, every `devicemotion` sample is pushed into the same bounded
 * queue the camera frames use, as a `vision.motion` item. Shake the phone and samples arrive at the
 * sensor's rate (about 60 per second); if the consumer is busy with a slow frame the queue fills, its
 * oldest entries are dropped and the depth gauge climbs. That is backpressure, produced by your hand.
 *
 * iOS only delivers motion events after `DeviceMotionEvent.requestPermission()` has been granted from a
 * tap. Other browsers just start sending (and a desktop sends nothing, or one empty event).
 *
 * The pure parts are tested in MotionProducer.test.ts; the two functions at the bottom touch `window`.
 */

export interface MotionSample {
  ax: number
  ay: number
  az: number
  /** `performance.now()` when the sample was read. */
  ts: number
}

interface AccelerationLike {
  x?: number | null
  y?: number | null
  z?: number | null
}

/** The slice of `DeviceMotionEvent` this file reads. */
export interface MotionEventLike {
  accelerationIncludingGravity?: AccelerationLike | null
  acceleration?: AccelerationLike | null
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/**
 * One sample from a motion event, or null when the event carries no numbers (a desktop browser fires an
 * empty event, or none at all). Gravity is included, so a phone lying still still reads about 9.8 on one axis.
 */
export function readSample(event: MotionEventLike, ts: number): MotionSample | null {
  const a = event.accelerationIncludingGravity ?? event.acceleration
  if (!a || (!finite(a.x) && !finite(a.y) && !finite(a.z))) return null
  return { ax: finite(a.x) ? a.x : 0, ay: finite(a.y) ? a.y : 0, az: finite(a.z) ? a.z : 0, ts }
}

/** The static side of `DeviceMotionEvent` on iOS 13+: a permission request that must be made from a tap. */
export interface MotionConstructorLike {
  requestPermission?: () => Promise<string>
}

export function needsMotionPermission(ctor: MotionConstructorLike | undefined): boolean {
  return typeof ctor?.requestPermission === 'function'
}

/** Ask for motion access where the platform requires it; `granted` elsewhere (nothing to ask). Never throws. */
export async function requestMotionPermission(ctor: MotionConstructorLike | undefined): Promise<'granted' | 'denied'> {
  if (!ctor || !needsMotionPermission(ctor)) return 'granted'
  try {
    return (await ctor.requestPermission?.()) === 'granted' ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}

/** The 3-axis magnitude of a sample, in the sensor's units (m/s^2). Handy for a "how hard are you shaking" readout. */
export function magnitude(sample: Pick<MotionSample, 'ax' | 'ay' | 'az'>): number {
  return Math.sqrt(sample.ax * sample.ax + sample.ay * sample.ay + sample.az * sample.az)
}

// ---- browser glue (not unit tested: it needs a window) -----------------------------------------------

/** A device that might have motion sensors: the event type exists and the screen takes touch (a phone or tablet). */
export function motionMaybeAvailable(): boolean {
  return typeof DeviceMotionEvent !== 'undefined' && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
}

/** `DeviceMotionEvent` as a constructor-like with the iOS permission method, or undefined without the event type. */
export function motionConstructor(): MotionConstructorLike | undefined {
  return typeof DeviceMotionEvent === 'undefined' ? undefined : (DeviceMotionEvent as unknown as MotionConstructorLike)
}

/**
 * Listen for motion and hand each real sample to `onSample`. Returns the function that stops listening.
 * Call after permission has been granted (iOS) or straight away (elsewhere).
 */
export function startMotion(onSample: (sample: MotionSample) => void): () => void {
  const listener = (event: DeviceMotionEvent) => {
    const sample = readSample(event, performance.now())
    if (sample) onSample(sample)
  }
  window.addEventListener('devicemotion', listener)
  return () => window.removeEventListener('devicemotion', listener)
}
