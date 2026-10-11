// PLACEHOLDER from F (foundation). Owned by S2 after F merges: replace with the real embedder
// (spec 6.6: runs only if public/models/minilm/model_quantized.onnx exists, writes dist/retrieval/embeddings.json).
import { existsSync } from 'node:fs'

if (!existsSync('public/models/minilm/model_quantized.onnx')) {
  console.log('embed-corpus: no embedding model published (public/models/minilm/); BM25 only. Skipping.')
}
