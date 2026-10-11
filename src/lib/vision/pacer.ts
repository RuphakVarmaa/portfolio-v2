/**
 * The capture pacer (spec 4.4: "grabs frames at <= 15 Hz"; the standard tier caps at 10 Hz).
 *
 * A camera delivers frames at its own rate (20, 24, 30 or 60 a second) and `requestVideoFrameCallback` hands
 * every one of them over. Taking a frame only when "at least one period has passed since the LAST one I took"
 * under-delivers badly: from a 20 fps camera and a 15 Hz cap it takes every second frame, 10 a second. The
 * pacer keeps a SCHEDULE instead: frames are due every `periodMs`, a frame is taken when it is due, and the
 * next due time advances by one period (not from "now"), so the long-run rate is the cap whenever the camera
 * can keep up with it, and never above it.
 *
 * Pure TypeScript with an injected clock reading, so the tests need no timers.
 */

export interface Pacer {
  /**
   * Is a frame arriving at `now` (ms, any monotonic clock) due? When it is, the schedule advances and the
   * caller must take the frame. Call it only for a frame you are able to take.
   */
  ready(now: number): boolean
  /** Forget the schedule: the next frame is taken at once. Use when a new source starts. */
  reset(): void
}

/**
 * `slackMs` lets a frame that arrives just before its due time count as on time (a 30 fps camera's frames
 * are 33.3 ms apart, so a 66.7 ms schedule would otherwise flip between every second and every third frame).
 * When the camera (or the page) stalls for more than a whole period, the schedule restarts from that frame:
 * a long pause must not be followed by a burst of back-to-back captures to "catch up".
 */
export function createPacer(periodMs: number, slackMs = 2): Pacer {
  if (!(periodMs > 0)) throw new RangeError(`A pacer needs a positive period (got ${String(periodMs)})`)
  let due = Number.NEGATIVE_INFINITY
  return {
    ready(now) {
      if (now < due - slackMs) return false
      // The first frame, or the first after a stall, is due `periodMs` from now. Otherwise the schedule just
      // advances by one period: it does not restart from "now", which is what makes the rate drift-free.
      due = due === Number.NEGATIVE_INFINITY || now - due > periodMs ? now + periodMs : due + periodMs
      return true
    },
    reset() {
      due = Number.NEGATIVE_INFINITY
    },
  }
}
