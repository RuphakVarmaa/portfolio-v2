// PLACEHOLDER from F (foundation). Owned by S2 after F merges: replace the empty handler map.
//
// Handlers to implement (src/cluster/protocol.ts):
//   'retrieval.warm'      -> fetch corpus.json, build BM25                  -> { chunks, terms }
//   'retrieval.search'    -> top-K hits + real stage timings                -> { hits, stages }
//   'retrieval.loadModel' -> stream the ONNX model, create the ORT session -> { bytes, dim, chunksEmbedded }
//
// Until then the worker boots, posts `ready` (so the lamp lights honestly) and rejects jobs with
// "no handler" errors.
import { defineWorker } from './_base.ts'

defineWorker('retrieval-a', {})
