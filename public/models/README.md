# Model files

Nothing in the build downloads a model. The site is complete and honest without any of them: retrieval answers
with BM25 and says so, and the vision panel says its detector is not published yet. This folder is where the
owner adds the files. Each one switches a tap on, and only on a tap does a visitor's browser fetch it.

| File | Used by | State today | Size |
|---|---|---|---|
| `minilm/vocab.txt` | the retrieval corpus build (it counts wordpieces) and the embedding tap | in the repo | 231,508 bytes |
| `minilm/model_quantized.onnx` | the retrieval tap ("Load the embedding model") | **not published** | about 23 MB |
| `yolov8n/yolov8n-320.onnx` | the vision tap | not published, see `yolov8n/README.md` | about 3.5 MB |

The ONNX Runtime WebAssembly (14,239,897 bytes) is not in this folder: `scripts/copy-ort.mjs` copies it from the
`onnxruntime-web` package into `public/ort/` on install, dev and build.

## The vocabulary: `minilm/vocab.txt`

The BERT uncased vocabulary (30,522 tokens, one per line), the one all-MiniLM-L6-v2 was trained with. The corpus
build cuts the page's text into 256-wordpiece windows with it, and the in-browser encoder tokenizes with it. It is
fetched by a visitor only when they tap the embedding model; BM25 never needs it.

- Licence: Apache License 2.0, copyright Google (<https://github.com/google-research/bert>; also published as
  `vocab.txt` in the `bert-base-uncased` repository on Hugging Face).
- Its SHA-256 is pinned in `scripts/parity.test.mjs`, so a different file fails `pnpm test`:

  ```
  07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3  vocab.txt
  ```

  Check your copy with `shasum -a 256 public/models/minilm/vocab.txt`. To use a copy you fetched yourself, replace
  the file and check that the hash matches.
- Without it, `node scripts/build-corpus.ts` still works: it counts words instead of wordpieces, writes
  `"tokenizer": "words"` into `corpus.json`, and the embedding tap stays hidden with one line saying why.

## Adding the embedding model: `minilm/model_quantized.onnx`

What the site expects (the same shape the `Xenova/all-MiniLM-L6-v2` export has):

- the `sentence-transformers/all-MiniLM-L6-v2` encoder, exported to ONNX and dynamically quantized to int8
  (about 23 MB; the build refuses anything over 24 MB);
- inputs `input_ids`, `attention_mask`, `token_type_ids` (all int64, shape `[batch, sequence]`);
- one output, `last_hidden_state`, shape `[batch, sequence, 384]`. The site does the mean pooling over the
  attention mask and the L2 normalisation itself (`src/lib/retrieval/embed.ts`), identically at build time and in
  the browser.

The two routes below are the documented ones. They were **not run while this folder was prepared** (no model was
downloaded), so check the file with the steps after them.

### Route A: export and quantize it yourself

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install "optimum[onnxruntime]" onnxruntime

# 1. export the encoder (fp32, about 90 MB) with the inputs and output named above
optimum-cli export onnx --model sentence-transformers/all-MiniLM-L6-v2 --task feature-extraction minilm-onnx

# 2. dynamic int8 quantization, about 23 MB
python - <<'PY'
from onnxruntime.quantization import QuantType, quantize_dynamic
quantize_dynamic("minilm-onnx/model.onnx", "model_quantized.onnx", weight_type=QuantType.QInt8)
PY

# 3. publish it
cp model_quantized.onnx public/models/minilm/model_quantized.onnx
```

### Route B: use an existing ONNX export

The `Xenova/all-MiniLM-L6-v2` repository on Hugging Face (Apache 2.0) ships `onnx/model_quantized.onnx` with
exactly these inputs and output. Copy that file to `public/models/minilm/model_quantized.onnx`.

### Check it

```bash
ls -l public/models/minilm/model_quantized.onnx     # about 23 MB, never more than 24 MB
node scripts/build-corpus.ts                        # prints "embedding model published (...); the tap will be offered."
pnpm dev                                            # open the retrieval panel, tap "Load the embedding model"
pnpm build                                          # also writes dist/retrieval/embeddings.json (build-time vectors)
```

When the model is published, the tap appears under the demo with the real sizes of the files this build ships. A
tap fetches the vocabulary, the model and the runtime with a progress bar, starts the ONNX session inside the
retrieval worker (on-origin module worker: the Content-Security-Policy needs no `'wasm-unsafe-eval'`, see
`docs/CSP_SPIKE.md`), and takes the vectors of the page's elements from `dist/retrieval/embeddings.json` where they
still match the page's text (any element that changed is embedded in the browser: with no embeddings file that is
every one, a few seconds). Searches then use BM25 and the embedding together.

The encoder embeds the page elements inside each 256-wordpiece window (a paragraph, a caption, a work-trace entry),
each with its section's heading in front, and a window takes the cosine of its nearest element rather than the cosine
of one vector for the whole window: a window of this page mixes a heading, numbers, a stack line and three
explanations, and one vector for all of that finds little. `src/lib/retrieval/units.ts` has the reasoning and the
small local check behind it. The build and the browser call the same function, so both embed identical inputs.

If the session cannot start (no WebAssembly SIMD, say), the panel says so and BM25 stays live.

### Parity test (build-time and browser embeddings must agree)

`pnpm test` runs `scripts/parity.test.mjs`. It is **skipped, not failed**, while the model or a browser-made fixture
is missing. To switch it on:

1. publish the model (above) and run `pnpm dev`;
2. open `/experiments/`, use "export parity fixture", and save the file over
   `src/lib/retrieval/parity-fixture.json`;
3. `pnpm test`: Node embeds the same five sentences with the same `onnxruntime-web` package, the same int8 file and
   the same tokenizer, and compares with the vectors the browser computed (cosine at least 0.999 for each).

The five sentences are fixed in `src/lib/retrieval/embed.ts` and are not about the site, so editing the site's copy
never makes the fixture stale. The committed fixture is an empty template (`vectors: null`) until a real run fills it.

## Licences

| Thing | Licence |
|---|---|
| `minilm/vocab.txt` (BERT uncased vocabulary) | Apache License 2.0, Google |
| all-MiniLM-L6-v2 | Apache License 2.0 (sentence-transformers; the MiniLM distillation is Microsoft's) |
| `onnxruntime-web` and its WebAssembly | MIT |
