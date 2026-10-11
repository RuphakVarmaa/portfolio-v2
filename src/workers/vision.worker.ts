// PLACEHOLDER from F (foundation). Owned by S3 after F merges: replace the empty handler map.
//
// Handlers to implement (src/cluster/protocol.ts):
//   'vision.warm'      -> { ok: true }
//   'vision.loadModel' -> stream yolov8n-320.onnx, create the ORT session -> { bytes }
//   'vision.detect'    -> letterbox, run, NMS                              -> { boxes, inferMs, ts }
//   'vision.motion'    -> zero-cost job fed by the DeviceMotion producer    -> { ts }
//
// Keep `onnxruntime-web` behind a dynamic import inside 'vision.loadModel' so booting this worker
// costs a few KB, not the ORT runtime.
import { defineWorker } from './_base.ts'

defineWorker('vision-a', {})
