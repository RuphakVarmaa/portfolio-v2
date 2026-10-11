import { INPUT_SIZE } from '../../../lib/vision/letterbox.ts'
import type { Message } from './Pipeline.ts'

/**
 * The Vision demo's own short UI strings: button verbs, status lines, notes, announcements.
 *
 * The spec's prose for this service (the depth copy, the work trace, the consent text, the honest caption,
 * the gauge names, `your device: N FPS`, `backpressure engaged`, `No recorded run published yet.`) lives in
 * `src/data/copy.ts` and is used from there. What is here is the working vocabulary of a live demo that
 * copy.ts does not have a key for.
 *
 * SPEC-GAP: if the integrator wants every sentence in one place, move these under `copy.services.vision.demo`
 * (the keys below map one to one). They contain no numbers of their own: sizes, rates and delays are
 * passed in from the places that measured or configured them.
 */

export const strings = {
  stage: {
    heading: 'VIEWFINDER',
    testCard: 'TEST CARD',
    live: 'LIVE',
    off: 'OFF',
    recorded: 'RECORDED RUN',
    /** On the picture while a camera or image is running without a detector: nothing is being detected, and the picture says so. */
    noDetectorTag: 'NO DETECTOR · QUEUE ONLY',
    /** A detector is published but this visitor has not loaded it yet. */
    notLoadedTag: 'DETECTOR NOT LOADED',
    loadingTag: 'LOADING DETECTOR',
    /** aria-label of the canvas while nothing is running. */
    canvasIdle: 'Test card in one-bit dither: a black-to-white ramp, eight grey steps and two stripes. No camera is running.',
    canvasRunning: 'Camera frame in one-bit dither.',
    canvasStill: 'Your image in one-bit dither.',
    canvasReplay: 'A recorded run, drawn over the test card.',
    /** `3 objects detected: person, cup, laptop` */
    objects: (count: number, names: string) => `${count} ${count === 1 ? 'object' : 'objects'} detected: ${names}`,
    more: (count: number) => `and ${count} more`,
    noObjects: 'No objects detected.',
    noDetector: 'No detector is loaded, so nothing is detected.',
  },

  controls: {
    stop: 'Stop',
    clear: 'Clear image',
    flip: 'Flip camera',
    motion: 'Motion sensors',
    pickImage: 'Choose an image file',
    replay: 'Play the recorded run',
    replayStop: 'Stop the replay',
  },

  queue: {
    heading: 'QUEUE',
    /** Beside the heading: the capacity comes from the ring itself, never typed here. */
    hint: (capacity: number) => `holds ${capacity}, throws out the oldest when full`,
    /** Plain-language caption for the rack (shown while Plain language is on). */
    plain: (capacity: number) =>
      `Pictures, and readings from your phone's motion sensor, wait in a rack of ${capacity} slots. The worker takes the oldest first. If the rack is full, the oldest is thrown out, so what you see stays recent.`,
    in: 'IN',
    oldest: 'OLDEST',
    worker: 'WORKER',
    /** The number on a frame card: its capture number in this run. */
    tag: (n: number) => `#${n}`,
  },

  speed: {
    legend: 'Worker speed',
    help: 'Slow the worker on purpose to watch the queue fill and the oldest frames drop.',
    normal: 'Normal',
    slow: 'Slow',
    stalled: 'Stalled',
    note: (ms: number) => `adds ${ms} ms to every item, on purpose`,
  },

  gauges: {
    heading: 'GAUGES',
    /** Plain-language caption for the three dials. "19 of every 20" is what p95 means; no figure here is a measurement. */
    plain:
      'Read live from your device. The first dial is how long the worker takes on a picture (19 of every 20 finish at least that fast). The second is how many pictures are waiting. The third is how many were thrown away.',
    /** Instead of the caption above while a recording is replayed: the dials are not this device's. */
    plainReplay:
      'You are watching a replay. These numbers were measured on the device named below when the run was recorded; none of them is measured on yours. The dials mean the same things as in a live run.',
    pass: 'worker pass p95 (ms)',
    passNote: 'No detector is loaded, so the first dial is the worker’s letterbox pass, not inference.',
    noData: 'No frames yet.',
    limit: (production: string) => `Hatched zone: slower than production (${production}).`,
    queueNote: 'recent peak',
    thisDevice: 'THIS DEVICE',
    /** The frame rate of a recorded run, which is the recording device's, not this one's. */
    recordedFps: (fps: number) => `recorded: ${fps} FPS`,
    production: 'PRODUCTION',
    captureCap: (hz: number) => `capture capped at ${hz} Hz`,
    samplesDropped: (count: number) => `Motion samples dropped: ${count}.`,
    fpsNote: 'frames delivered per second over 3 s',
    /** While the worker is slowed on purpose, so the number is never mistaken for what the device can do. */
    slowedNote: 'The worker is slowed on purpose, so this is not what your device can do.',
  },

  detector: {
    absent:
      'Detector not published yet. Frames still go through capture, the queue and a worker pass, so the gauges are real; nothing is detected.',
    noSimd: 'This browser has no WebAssembly SIMD, which the runtime needs, so the detector cannot load here.',
    loading: { runtime: 'Downloading the runtime…', model: 'Downloading the model…', session: 'Starting the detector…' },
    ready: (quant: string) => `Detector ready: YOLOv8n ${quant} at ${INPUT_SIZE} px.`,
    failed: (reason: string) => `The detector could not load: ${reason}`,
    retry: 'Try again',
    progress: (loaded: string, total: string | null) => (total ? `${loaded} of ${total}` : `${loaded} so far`),
    /** Added to the consent dialog when starting the camera will also load the detector. `sizes` comes from the tap label. */
    alsoLoads: (sizes: string) => `Allowing the camera also loads the detector: ${sizes}.`,
  },

  motion: {
    asking: 'Waiting for your answer…',
    waiting: 'Listening for motion…',
    live: 'Motion samples are feeding the same queue as the frames.',
    keepingUp: 'The worker is keeping up. Slow it down to watch backpressure engage.',
    denied: 'Motion access was declined.',
    none: 'This device reports no motion data.',
  },

  tier: {
    basic: 'This device runs the Basic tier, so the camera and the detector are switched off here. The tier can be changed in the Colophon.',
    unsupported: (why: string) => `This browser cannot run the pipeline: ${why}`,
  },

  drop: {
    over: 'Drop to process this image',
  },

  record: {
    heading: 'RECORDER (owner mode, ?record=1)',
    start: 'Start recording',
    stop: 'Stop recording',
    download: 'Download vision.json',
    clear: 'Discard',
    count: (frames: number) => `${frames} frames recorded`,
    full: 'The recording is full and stopped by itself.',
    note: 'Record a real run with the detector loaded, download the file, and save it as public/traces/vision.json.',
  },

  replay: {
    heading: 'RECORDED RUN',
    meta: (device: string, date: string) => `${device} · ${date}`,
    note: 'The frames were not stored; the boxes and timings are replayed over the test card.',
  },

  announce: {
    cameraLive: 'Camera live. Frames are processed in your browser and never uploaded.',
    clipLive: 'Playing the recorded clip through the pipeline.',
    detectorLoading: 'Loading the detector.',
    detectorReady: 'Detector ready.',
    backpressureOn: 'Backpressure engaged: the queue is full, so the oldest frames are being dropped.',
    backpressureOff: 'Backpressure cleared.',
    pipelineDone: 'Pipeline run finished. The measured timings are listed under Pipeline.',
    pipelineFailed: 'The pipeline run did not finish.',
    replayStarted: 'Replaying a recorded run.',
  },
} as const

/** The status line (and what is announced) for a pipeline message. */
export function messageText(message: Message): string {
  switch (message.kind) {
    case 'idle':
      return 'Camera off. Nothing is captured, uploaded or stored.'
    case 'starting':
      return 'Starting the camera…'
    case 'live':
      return `Live at ${message.width} × ${message.height}, captured at up to ${message.hz} Hz.`
    case 'clip':
      return 'Playing the recorded clip.'
    case 'still':
      return `Processed in your browser: ${message.name}.`
    case 'replay':
      return 'Replaying a recorded run. These frames are not live.'
    case 'denied':
      return 'The camera is blocked here. You can still drop an image.'
    case 'no-camera':
      return 'No camera was found. You can still drop an image.'
    case 'busy':
      return 'The camera is in use by another app.'
    case 'camera-error':
      return 'The camera could not start. You can still drop an image.'
    case 'stopped':
      return {
        user: 'Camera stopped.',
        esc: 'Camera stopped (Esc).',
        scroll: 'Camera stopped because you scrolled away.',
        hidden: 'Camera stopped because this tab was hidden.',
        unmount: 'Camera stopped.',
      }[message.why]
    case 'image-error':
      return 'That file could not be read as an image.'
    case 'image-large':
      return 'That image is too large to process here.'
    case 'worker-error':
      return `The vision worker reported: ${message.text}`
    case 'frame-dropped':
      return 'That frame was dropped by the queue before it could be timed. Try again.'
  }
}
