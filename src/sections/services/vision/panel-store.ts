import type { Stage } from '../../../cluster/protocol.ts'
import { createStore } from '../../../lib/vision/store.ts'

/**
 * What the Vision demo tells the ServicePanel around it. The panel (this file's reader, `index.tsx`) is part
 * of the initial JavaScript; the demo is a lazy chunk. The two meet here, in a store that is a few hundred
 * bytes: the demo writes measured stage timings and which schematic parts are running; the panel draws them
 * in the "Show me the pipeline" list and on the schematic.
 *
 * It is written only on events (a pipeline run, a source starting or stopping, the build's inventory being read),
 * never per frame, so the panel is not re-rendered at the camera's rate.
 */

/** Does this build ship a detector? `unknown` until the demo has read the build's inventory (and in the prerendered HTML). */
export type DetectorKnown = 'unknown' | 'absent' | 'published'

export interface PanelState {
  /** Measured timings from the last "Show me the pipeline" run. */
  stages: readonly Stage[]
  /** A pipeline run is in flight. */
  busy: boolean
  /** Schematic part ids drawn as running (`camera`, `queue`, `yolo`, `react`). */
  active: readonly string[]
  /** Measured text under a schematic part, keyed by part id (`{ camera: '1.2 ms' }`). */
  annotations: Readonly<Record<string, string>>
  /** Whether a detector is published with this build. The always-visible captions say so, and never claim detection without one. */
  detector: DetectorKnown
}

export const EMPTY_PANEL: PanelState = Object.freeze({ stages: [], busy: false, active: [], annotations: {}, detector: 'unknown' })

export const panelStore = createStore<PanelState>(EMPTY_PANEL)

let runner: (() => void) | null = null
let pending = false

/**
 * "Show me the pipeline" was pressed. If the demo has loaded it runs now; otherwise the request waits for
 * the demo (the button is in the panel, which is on screen before the lazy chunk may have arrived).
 */
export function requestPipeline(): void {
  if (runner) runner()
  else pending = true
}

/** The demo registers (and on unmount unregisters) the function that runs a real pipeline pass. */
export function registerPipelineRunner(run: (() => void) | null): void {
  runner = run
  if (run && pending) {
    pending = false
    run()
  }
}
