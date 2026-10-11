import { useSyncExternalStore } from 'react'
import type { NodeId, ServiceId } from './protocol.ts'

/**
 * Telemetry: the visitor's own session, measured in their browser and never transmitted anywhere.
 * PerformanceObserver feeds paint / LCP / long-task / resource numbers; the scheduler feeds worker
 * spawn and ready marks; model downloads report bytes; a requestAnimationFrame sampler measures the
 * frame budget, and runs only while the board is on screen.
 *
 * Everything that reads a number from here shows a *measured* value. Nothing in this file is hard-coded.
 */

export interface WorkerTiming {
  /** `performance.now()` when the scheduler spawned the worker, or null if it has not been spawned. */
  spawnAt: number | null
  /** `performance.now()` when the worker posted `ready`, or null. */
  readyAt: number | null
  /** readyAt - spawnAt: how long this worker took to come up. */
  spinUpMs: number | null
}

export interface ModelTiming {
  loaded: number
  total: number | null
  done: boolean
}

export interface FrameStats {
  /** Mean frame interval over the last 120 sampled frames (ms). 0 until the first sample. */
  avgMs: number
  /** Frames whose interval exceeded 34 ms since sampling started. */
  dropped: number
  /** Number of frames sampled since sampling started. */
  frames: number
  /** 1000 / avgMs, rounded. 0 until the first sample. */
  fps: number
  /** True while the rAF sampler is running (board visible and page visible). */
  sampling: boolean
}

export interface ResourceEntry {
  /** Path of the resource (origin stripped). */
  name: string
  /** Transfer size in bytes (falls back to the encoded body size; 0 when the browser hides it). */
  bytes: number
  ms: number
}

export interface TelemetrySnapshot {
  /** ms from navigation start to the first response byte, or null. */
  ttfb: number | null
  /** First Contentful Paint, ms from navigation start, or null until it happens. */
  fcp: number | null
  /** Largest Contentful Paint candidate so far, or null. */
  lcp: number | null
  workers: Record<NodeId, WorkerTiming>
  models: Partial<Record<ServiceId, ModelTiming>>
  frames: FrameStats
  longTasks: { count: number; totalMs: number; maxMs: number }
  resources: ResourceEntry[]
}

export const EMPTY_FRAME_STATS: FrameStats = { avgMs: 0, dropped: 0, frames: 0, fps: 0, sampling: false }

/** Snapshot used on the server and before `start()`. Frozen so a stray write cannot poison prerender. */
export const EMPTY_SNAPSHOT: TelemetrySnapshot = Object.freeze({
  ttfb: null,
  fcp: null,
  lcp: null,
  workers: {},
  models: {},
  frames: EMPTY_FRAME_STATS,
  longTasks: { count: 0, totalMs: 0, maxMs: 0 },
  resources: [],
})

/** A frame interval above this is a dropped frame (two missed 60 Hz frames). */
export const DROPPED_FRAME_MS = 34
const FRAME_WINDOW = 120
const MAX_RESOURCES = 200

/** Pure: mean interval and fps for a window of frame deltas. Exported for tests. */
export function computeFrameStats(deltas: readonly number[], dropped: number, frames: number, sampling: boolean): FrameStats {
  if (deltas.length === 0) return { ...EMPTY_FRAME_STATS, dropped, frames, sampling }
  let sum = 0
  for (const d of deltas) sum += d
  const avgMs = sum / deltas.length
  return {
    avgMs: Math.round(avgMs * 10) / 10,
    dropped,
    frames,
    fps: Math.round(1000 / avgMs),
    sampling,
  }
}

interface MutableState {
  ttfb: number | null
  fcp: number | null
  lcp: number | null
  workers: Record<NodeId, WorkerTiming>
  models: Partial<Record<ServiceId, ModelTiming>>
  deltas: number[]
  dropped: number
  frames: number
  longTasks: { count: number; totalMs: number; maxMs: number }
  resources: ResourceEntry[]
}

function freshState(): MutableState {
  return {
    ttfb: null,
    fcp: null,
    lcp: null,
    workers: {},
    models: {},
    deltas: [],
    dropped: 0,
    frames: 0,
    longTasks: { count: 0, totalMs: 0, maxMs: 0 },
    resources: [],
  }
}

const listeners = new Set<() => void>()
let state = freshState()
let snapshot: TelemetrySnapshot = EMPTY_SNAPSHOT
let started = false
let lite = false
let boardVisible = false
let sampling = false
let rafId = 0
let lastFrameAt = 0
let flushTimer: ReturnType<typeof setTimeout> | undefined
const observers: PerformanceObserver[] = []
let boardObserver: IntersectionObserver | null = null
let boardEl: Element | null = null
let teardownVisibility: (() => void) | null = null

function buildSnapshot(): TelemetrySnapshot {
  return {
    ttfb: state.ttfb,
    fcp: state.fcp,
    lcp: state.lcp,
    workers: { ...state.workers },
    models: { ...state.models },
    frames: computeFrameStats(state.deltas, state.dropped, state.frames, sampling),
    longTasks: { ...state.longTasks },
    resources: state.resources.slice(),
  }
}

function flush() {
  flushTimer = undefined
  snapshot = buildSnapshot()
  for (const listener of listeners) listener()
}

/** `immediate` events (a worker became ready) are delivered on the next tick unless motion is lite. */
function schedule(immediate: boolean) {
  if (flushTimer !== undefined) return
  const delay = lite ? 500 : immediate ? 0 : 250
  flushTimer = setTimeout(flush, delay)
}

function frame(now: number) {
  if (!sampling) return
  if (lastFrameAt > 0) {
    const delta = now - lastFrameAt
    // Ignore the gap left by a hidden tab: rAF stops there and resumes with a huge first delta.
    if (delta < 1000) {
      state.deltas.push(delta)
      if (state.deltas.length > FRAME_WINDOW) state.deltas.shift()
      state.frames += 1
      if (delta > DROPPED_FRAME_MS) state.dropped += 1
    }
  }
  lastFrameAt = now
  schedule(false)
  rafId = requestAnimationFrame(frame)
}

function updateSampler() {
  const shouldSample = started && boardVisible && typeof document !== 'undefined' && document.visibilityState === 'visible'
  if (shouldSample === sampling) return
  sampling = shouldSample
  if (sampling) {
    lastFrameAt = 0
    rafId = requestAnimationFrame(frame)
  } else {
    cancelAnimationFrame(rafId)
    rafId = 0
    lastFrameAt = 0
  }
  schedule(true)
}

function observe(type: string, onEntries: (entries: PerformanceEntryList) => void) {
  try {
    const observer = new PerformanceObserver((list) => {
      onEntries(list.getEntries())
      schedule(true)
    })
    observer.observe({ type, buffered: true })
    observers.push(observer)
  } catch {
    /* entry type not supported in this browser (e.g. longtask on Safari): leave the number null/zero */
  }
}

function resourceName(raw: string): string {
  try {
    const url = new URL(raw)
    return url.pathname + url.search
  } catch {
    return raw
  }
}

function discoverBoard() {
  if (boardEl || typeof document === 'undefined') return
  const el = document.querySelector('[data-board]')
  if (el) observeBoard(el)
}

function observeBoard(element: Element | null): () => void {
  if (boardObserver) {
    boardObserver.disconnect()
    boardObserver = null
  }
  boardEl = element
  if (!element || typeof IntersectionObserver === 'undefined') {
    telemetry.setBoardVisible(false)
    return () => undefined
  }
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1]
      if (entry) telemetry.setBoardVisible(entry.isIntersecting && entry.intersectionRatio >= 0.1)
    },
    { threshold: [0, 0.1, 0.25] },
  )
  observer.observe(element)
  boardObserver = observer
  return () => {
    if (boardObserver === observer) {
      observer.disconnect()
      boardObserver = null
      boardEl = null
      telemetry.setBoardVisible(false)
    }
  }
}

export const telemetry = {
  /** Begin observing. Idempotent; called once from `bootCluster()`. No-op on the server. */
  start(): void {
    if (started || typeof window === 'undefined' || typeof performance === 'undefined') return
    started = true
    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (nav && nav.responseStart > 0) state.ttfb = Math.round(nav.responseStart)
    } catch {
      /* ignore */
    }
    observe('paint', (entries) => {
      for (const entry of entries) {
        if (entry.name === 'first-contentful-paint') state.fcp = Math.round(entry.startTime)
      }
    })
    observe('largest-contentful-paint', (entries) => {
      const last = entries[entries.length - 1]
      if (last) state.lcp = Math.round(last.startTime)
    })
    observe('longtask', (entries) => {
      for (const entry of entries) {
        state.longTasks.count += 1
        state.longTasks.totalMs += entry.duration
        state.longTasks.maxMs = Math.max(state.longTasks.maxMs, entry.duration)
      }
    })
    observe('resource', (entries) => {
      for (const entry of entries as PerformanceResourceTiming[]) {
        if (state.resources.length >= MAX_RESOURCES) break
        state.resources.push({
          name: resourceName(entry.name),
          bytes: entry.transferSize || entry.encodedBodySize || 0,
          ms: Math.round(entry.duration),
        })
      }
    })
    const onVisibility = () => updateSampler()
    document.addEventListener('visibilitychange', onVisibility)
    const onLoad = () => discoverBoard()
    window.addEventListener('load', onLoad)
    teardownVisibility = () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('load', onLoad)
    }
    discoverBoard()
    updateSampler()
    flush()
  },

  /** Stop observers and the sampler and reset all numbers (used by tests and HMR). */
  stop(): void {
    started = false
    for (const observer of observers.splice(0)) observer.disconnect()
    boardObserver?.disconnect()
    boardObserver = null
    boardEl = null
    boardVisible = false
    teardownVisibility?.()
    teardownVisibility = null
    sampling = false
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
    if (flushTimer !== undefined) clearTimeout(flushTimer)
    flushTimer = undefined
    state = freshState()
    snapshot = EMPTY_SNAPSHOT
    for (const listener of listeners) listener()
  },

  getSnapshot(): TelemetrySnapshot {
    return snapshot
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /** Called by the scheduler. Also writes a `worker:<node>:spawn|ready` User Timing mark (visible in DevTools). */
  markWorker(node: NodeId, phase: 'spawn' | 'ready', at: number = typeof performance !== 'undefined' ? performance.now() : 0): void {
    const previous = state.workers[node] ?? { spawnAt: null, readyAt: null, spinUpMs: null }
    const next: WorkerTiming =
      phase === 'spawn'
        ? { spawnAt: at, readyAt: null, spinUpMs: null }
        : { ...previous, readyAt: at, spinUpMs: previous.spawnAt === null ? null : Math.round((at - previous.spawnAt) * 10) / 10 }
    state.workers = { ...state.workers, [node]: next }
    try {
      performance.mark(`worker:${node}:${phase}`, { startTime: at })
    } catch {
      /* performance.mark unavailable */
    }
    schedule(true)
  },

  /** Report a model/runtime download. Call with `loaded === total` (or `done`) when it finishes. */
  recordModelBytes(service: ServiceId, loaded: number, total?: number | null): void {
    const known = total ?? state.models[service]?.total ?? null
    state.models = {
      ...state.models,
      [service]: { loaded, total: known, done: known !== null && loaded >= known },
    }
    schedule(true)
  },

  /** True while the board is at least 10 % on screen. The scheduler pings workers only while this is true. */
  isBoardVisible(): boolean {
    return boardVisible
  },

  /** Normally driven by `observeBoard`; exposed so a section can report visibility itself. */
  setBoardVisible(visible: boolean): void {
    if (boardVisible === visible) return
    boardVisible = visible
    updateSampler()
  },

  /**
   * Start tracking an element as "the board": the frame sampler runs only while it is >= 10 % visible.
   * Elements carrying the `data-board` attribute are found automatically; call this only if you
   * cannot set the attribute. Returns a cleanup function.
   */
  observeBoard,

  /** Lite motion batches every update to one per 500 ms. Wired from the preference store. */
  setLite(value: boolean): void {
    lite = value
  },
}

export function useTelemetry(): TelemetrySnapshot {
  return useSyncExternalStore(telemetry.subscribe, telemetry.getSnapshot, () => EMPTY_SNAPSHOT)
}

