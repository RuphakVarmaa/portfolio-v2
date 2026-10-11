import type { JobPayload, JobResult } from '../../cluster/protocol.ts'

/**
 * Types shared by the Vision panel (main thread) and the vision worker. Types only: erased at build time.
 *
 * The cluster protocol (src/cluster/protocol.ts) is frozen, so the worker and the panel agree on a few
 * extra fields by widening the frozen shapes here. A widened object is still a valid protocol object
 * (same required fields), so the scheduler passes it through untouched.
 */

/** What `public/models/yolov8n/metadata.json` says about the published detector (spec 6.7). */
export interface DetectorMeta {
  /** Input edge in pixels; the worker letterboxes to this (the export is 320). */
  inputSize: number
  /** Size of the .onnx file in bytes (the progress bar's total). */
  bytes: number
  sha256?: string
  /** `int8` or `fp16`: what the owner shipped. Shown on the panel. */
  quant: string
  /** Class names in class-id order (80 COCO names for the stock model). */
  classes: readonly string[]
}

/**
 * The vision worker's answer to `vision.detect`: the frozen result plus how the frame was handled, so
 * the panel never mistakes "no detector yet" for "a very fast detector".
 */
export type DetectResultX = JobResult['vision.detect'] & {
  /** True when a detector session ran this frame. False: the worker only letterboxed it and built the input tensor. */
  detector: boolean
  /** Milliseconds spent letterboxing the frame and filling the input tensor, measured in the worker. */
  preMs: number
  /** Milliseconds spent decoding the head and suppressing overlaps (0 without a detector). */
  postMs: number
}

/** `vision.loadModel` with the sizes the panel already knows, so the worker can report honest progress, and the class names. */
export type LoadPayloadX = JobPayload['vision.loadModel'] & {
  /** Decoded size of the .onnx file. */
  modelBytes?: number
  /** Decoded size of the ORT .wasm file. */
  wasmBytes?: number
  classes?: readonly string[]
}
