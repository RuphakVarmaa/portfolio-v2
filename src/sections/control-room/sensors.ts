/**
 * Does this device have motion sensors worth a lamp? (spec 3.2: "a fifth SENSORS lamp appears only on
 * devices reporting DeviceMotionEvent".)
 *
 * `typeof DeviceMotionEvent !== 'undefined'` alone is true on desktop Chrome and Firefox, which expose the
 * interface but never fire it, and the lamp's caption says "Your phone can do something the laptop can't".
 * Nor is `DeviceMotionEvent.requestPermission` a tell any more: current desktop Chrome has it too. So the
 * interface must exist AND the device must be one a person shakes, which means the primary pointer is a
 * finger (phones, tablets, Android, Windows tablets), or it is an iPad that reports a desktop user agent
 * (`MacIntel` with multi-touch; real Macs report no touch points).
 *
 * Pure: the caller passes the globals in, so the rule is unit-tested without a browser.
 */

export interface SensorEnvironment {
  DeviceMotionEvent?: unknown
  matchMedia?: (query: string) => { matches: boolean }
  maxTouchPoints?: number
  platform?: string
}

export function detectMotionSensors(env: SensorEnvironment): boolean {
  const motion = env.DeviceMotionEvent
  if (motion === undefined || motion === null) return false
  try {
    if (env.matchMedia?.('(pointer: coarse)').matches === true) return true
  } catch {
    /* an engine that rejects the query: fall through to the iPad check */
  }
  return env.platform === 'MacIntel' && (env.maxTouchPoints ?? 0) > 1
}
