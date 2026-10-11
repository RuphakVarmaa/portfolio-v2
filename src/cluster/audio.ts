/**
 * Sound, synthesized in the visitor's browser with the Web Audio API. There are no audio files and no
 * network requests. Off by default; the `AudioContext` is only created or resumed from a user gesture.
 *
 *   click()      relay click: a 5 ms noise burst through a 2 kHz band-pass at -18 dB (max 20 per second)
 *   humStart()   55 Hz sine + 110 Hz at -30 dB, faded in over 300 ms; plays while this tab is leader
 *   humStop()    300 ms fade out
 *   failover()   descending two-tone, 880 Hz then 440 Hz, 180 ms in total
 */

export interface AudioState {
  /** The visitor switched sound on. */
  enabled: boolean
  /** An AudioContext exists and is running, so calls make noise. False until a gesture unlocks it. */
  unlocked: boolean
}

export interface AudioApi {
  /** Call from a click/keypress handler when the visitor toggles sound. */
  setEnabled(on: boolean): void
  isEnabled(): boolean
  getState(): AudioState
  subscribe(listener: () => void): () => void
  click(): void
  humStart(): void
  humStop(): void
  failover(): void
}

export const CLICK_MAX_PER_SECOND = 20
export const HUM_FADE_S = 0.3
export const CLICK_GAIN = Math.pow(10, -18 / 20) // -18 dB
export const HUM_GAIN = Math.pow(10, -24 / 20) // fundamental, -24 dB
export const HUM_HARMONIC_GAIN = Math.pow(10, -30 / 20) // 110 Hz at -30 dB

/** Sliding-window limiter: allows at most `max` events in any `windowMs`. Pure, so it is unit-tested. */
export function createRateLimiter(max: number, windowMs: number, now: () => number): () => boolean {
  const stamps: number[] = []
  return () => {
    const t = now()
    while (stamps.length > 0 && t - stamps[0] >= windowMs) stamps.shift()
    if (stamps.length >= max) return false
    stamps.push(t)
    return true
  }
}

/** Deterministic noise so a click always sounds the same. */
function fillNoise(buffer: AudioBuffer, seed = 0x9e3779b9) {
  const data = buffer.getChannelData(0)
  let x = seed | 0
  for (let i = 0; i < data.length; i++) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    data[i] = ((x >>> 0) / 0xffffffff) * 2 - 1
  }
}

export function createAudio(): AudioApi {
  const listeners = new Set<() => void>()
  const allowClick = createRateLimiter(CLICK_MAX_PER_SECOND, 1000, () => (typeof performance !== 'undefined' ? performance.now() : Date.now()))
  let enabled = false
  let context: AudioContext | null = null
  let noise: AudioBuffer | null = null
  let state: AudioState = { enabled: false, unlocked: false }
  let hum: { master: GainNode; stop: () => void } | null = null
  let gestureCleanup: (() => void) | null = null

  const publish = () => {
    const unlocked = enabled && context?.state === 'running'
    if (state.enabled === enabled && state.unlocked === unlocked) return
    state = { enabled, unlocked }
    for (const listener of [...listeners]) listener()
  }

  const ensureContext = (): AudioContext | null => {
    if (context) return context
    const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : undefined
    if (!Ctor) return null
    try {
      context = new Ctor()
      context.addEventListener('statechange', publish)
      noise = context.createBuffer(1, Math.max(1, Math.round(context.sampleRate * 0.005)), context.sampleRate)
      fillNoise(noise)
    } catch {
      context = null
    }
    return context
  }

  const tryResume = () => {
    const ctx = ensureContext()
    if (!ctx) return
    if (ctx.state === 'running') {
      publish()
      return
    }
    ctx.resume().then(publish, publish)
  }

  /** If sound was enabled without a gesture (or the browser refused), unlock on the next one. */
  const armGestureUnlock = () => {
    if (gestureCleanup || typeof window === 'undefined') return
    const handler = () => {
      gestureCleanup?.()
      gestureCleanup = null
      if (enabled) tryResume()
    }
    const events = ['pointerdown', 'keydown', 'touchend'] as const
    for (const name of events) window.addEventListener(name, handler, { once: true, passive: true })
    gestureCleanup = () => {
      for (const name of events) window.removeEventListener(name, handler)
    }
  }

  const live = (): AudioContext | null => (enabled && context && context.state === 'running' ? context : null)

  const humStop = () => {
    if (!hum) return
    const current = hum
    hum = null
    current.stop()
  }

  return {
    setEnabled(on) {
      enabled = on
      if (on) {
        tryResume()
        if (!context || context.state !== 'running') armGestureUnlock()
      } else {
        humStop()
        if (context && context.state === 'running') context.suspend().then(publish, publish)
      }
      publish()
    },
    isEnabled: () => enabled,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    click() {
      const ctx = live()
      if (!ctx || !noise || !allowClick()) return
      const t = ctx.currentTime
      const source = ctx.createBufferSource()
      source.buffer = noise
      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.value = 2000
      band.Q.value = 1.1
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(CLICK_GAIN, t)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.006)
      source.connect(band).connect(gain).connect(ctx.destination)
      source.start(t)
    },

    humStart() {
      const ctx = live()
      if (!ctx || hum) return
      const t = ctx.currentTime
      const master = ctx.createGain()
      master.gain.setValueAtTime(0, t)
      master.gain.linearRampToValueAtTime(1, t + HUM_FADE_S)
      master.connect(ctx.destination)
      const make = (frequency: number, level: number) => {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = frequency
        const gain = ctx.createGain()
        gain.gain.value = level
        osc.connect(gain).connect(master)
        osc.start(t)
        return osc
      }
      const oscillators = [make(55, HUM_GAIN), make(110, HUM_HARMONIC_GAIN)]
      hum = {
        master,
        stop: () => {
          const now = ctx.currentTime
          master.gain.cancelScheduledValues(now)
          master.gain.setValueAtTime(master.gain.value, now)
          master.gain.linearRampToValueAtTime(0, now + HUM_FADE_S)
          for (const osc of oscillators) osc.stop(now + HUM_FADE_S + 0.02)
        },
      }
    },

    humStop,

    failover() {
      const ctx = live()
      if (!ctx) return
      const t = ctx.currentTime
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(880, t)
      osc.frequency.setValueAtTime(440, t + 0.09)
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.linearRampToValueAtTime(0.09, t + 0.01)
      gain.gain.setValueAtTime(0.09, t + 0.08)
      gain.gain.linearRampToValueAtTime(0.0001, t + 0.18)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.2)
    },
  }
}

/** The site's synth. Safe to import on the server: nothing is created until `setEnabled(true)`. */
export const audio: AudioApi = createAudio()
