# The vision service: detector, clip, recorded run

Nothing in the build downloads a model, a video or a trace. The Vision panel is complete and honest without any of
them. It starts the camera (or takes a dropped image), pushes frames and, on a phone, motion samples through a real
bounded queue, runs them through a real worker and measures it all on the visitor's device. What it **cannot** do
without the detector is draw boxes, and it says so on the picture (`NO DETECTOR · QUEUE ONLY`) and in the page.

Three optional files switch three more things on. Each is checked at build time (`dist/build-info.json`), so a
missing file never costs a visitor a 404 in the console.

| File | Switches on | State today |
|---|---|---|
| `models/yolov8n/yolov8n-320.onnx` + `models/yolov8n/metadata.json` | the detector tap, the boxes, the inference gauge | **not published** |
| `media/desk.mp4` | the "Or run the recorded clip" button | **not published** |
| `traces/vision.json` | the "Play the recorded run" button (a replay of boxes and timings, clearly labelled) | **not published** |

The ONNX Runtime WebAssembly (about 14 MB) is not in this folder: `scripts/copy-ort.mjs` copies it from the
`onnxruntime-web` package into `public/ort/`. A visitor's browser fetches the runtime and the model only after they
allow the camera on a full-tier device (the consent dialog says so, with the sizes) or tap "Load the detector".

## 1. The detector: `yolov8n-320.onnx` and `metadata.json`

### What the site expects

- YOLOv8n (80 COCO classes) exported at 320 x 320: input `images` float32 `[1, 3, 320, 320]`, values 0 to 1, RGB;
- one output of shape `[1, 84, 2100]` (4 box numbers then 80 class scores for each of 2100 anchors); the transposed
  `[1, 2100, 84]` is read as well. There is no separate objectness channel in v8: the best class score is the
  confidence. The worker does the letterbox, the decode and the non-maximum suppression itself (IoU 0.45,
  confidence 0.25, at most 50 boxes);
- the file the build finds at `models/yolov8n/yolov8n-320.onnx`, at most **6.5 MB** (`scripts/check-budgets.mjs`
  fails the build above that). The panel's tap says about 3.5 MB; it shows the real size of the file you publish.

### Route: export, then quantize to int8

These are the standard Ultralytics and ONNX Runtime steps. They were **not run while this folder was prepared** (no
model was downloaded), so check the file with the steps after them before you commit it.

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install ultralytics onnx onnxruntime pillow numpy

# 1. export the stock YOLOv8n at 320 px (float32, about 12 MB)
yolo export model=yolov8n.pt format=onnx imgsz=320 opset=17 simplify=True

# 2. prepare it for static quantization (shape inference and fusion)
python -m onnxruntime.quantization.preprocess --input yolov8n.onnx --output yolov8n-pre.onnx
```

```python
# quantize.py: static int8 (QDQ) with about 100 calibration pictures in ./calib/*.jpg
import glob
import numpy as np
import onnx
from PIL import Image
from onnxruntime.quantization import CalibrationDataReader, QuantFormat, QuantType, quantize_static

SIZE = 320

class Pictures(CalibrationDataReader):
    def __init__(self, folder):
        self.paths = iter(sorted(glob.glob(f"{folder}/*.jpg"))[:100])

    def get_next(self):
        path = next(self.paths, None)
        if path is None:
            return None
        image = Image.open(path).convert("RGB")
        scale = SIZE / max(image.size)          # letterbox like the site does: fit, then pad with grey 114
        image = image.resize((round(image.width * scale), round(image.height * scale)))
        canvas = Image.new("RGB", (SIZE, SIZE), (114, 114, 114))
        canvas.paste(image, ((SIZE - image.width) // 2, (SIZE - image.height) // 2))
        x = np.asarray(canvas, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
        return {"images": x}

# Keep the last convolutions of the Detect head (the box and class outputs and the DFL) in float: int8 there
# is what usually ruins the boxes. Names are those of an Ultralytics export; print them to check.
model = onnx.load("yolov8n-pre.onnx")
keep = [n.name for n in model.graph.node if n.op_type == "Conv" and n.name.startswith("/model.22/") and (n.name.endswith(".2/Conv") or "dfl" in n.name)]
print("kept in float:", keep)

quantize_static(
    "yolov8n-pre.onnx",
    "yolov8n-320.onnx",
    Pictures("calib"),
    quant_format=QuantFormat.QDQ,
    per_channel=True,
    weight_type=QuantType.QInt8,
    activation_type=QuantType.QUInt8,
    nodes_to_exclude=keep,
)
```

If the boxes look wrong in the browser, exclude the whole head (`n.name.startswith("/model.22/")` for every node) and
quantize again; the file grows to roughly 5 MB, still inside the budget. A float32 export (about 12 MB) is over the
budget and the build will say so. Half-precision (`fp16`, about 6.3 MB) is the spec's other fallback, but the
WebAssembly execution provider does not run every half-precision kernel, so test it in the browser before relying
on it; the worker refuses a model whose input is not float32 and says why.

### `metadata.json`

Sits next to the model. `inputSize` must be 320, `bytes` is the size of the `.onnx` file (the progress bar's
total), `quant` is shown on the panel (`int8` or `fp16`), `classes` is optional (the 80 COCO names when omitted).

```bash
cd public/models/yolov8n
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const model = readFileSync('yolov8n-320.onnx')
const meta = { inputSize: 320, bytes: model.length, sha256: createHash('sha256').update(model).digest('hex'), quant: 'int8' }
writeFileSync('metadata.json', JSON.stringify(meta, null, 2) + '\n')
console.log(meta)
"
```

### Check it

```bash
ls -l public/models/yolov8n/                 # the .onnx is at most 6.5 MB
pnpm dev                                      # open /projects/vision/, allow the camera: boxes with class and confidence
pnpm build                                    # prints "Model: detector" against its 6.5 MB budget
```

On a full-tier device the camera dialog's Allow also loads the detector (the dialog says so); on any other device the
"Load the detector" tap does. Both show the real sizes of the files this build ships. The gauge named
`inference p95 (ms)` then reads the last 60 `session.run` times; without a detector it is named
`worker pass p95 (ms)` and measures the letterbox pass instead, never a made-up inference time.

### Licence: read this before you publish the file

The Ultralytics YOLOv8 code and its pretrained weights are released under the **AGPL-3.0** (Ultralytics also sells
an enterprise licence). Publishing the exported model on a public site is a decision for you to make with that
licence in front of you (<https://www.ultralytics.com/legal/agpl-3-0-software-license>); this repository does not
make it for you. A detector with a permissive licence and the same output shape works unchanged. ONNX Runtime and
`onnxruntime-web` are MIT. COCO's class names are the 80 in `src/lib/vision/coco-classes.ts`.

## 2. The clip: `public/media/desk.mp4`

Four seconds filmed by you, H.264, at most 1.5 MB, no audio. The button reads "Or run the recorded clip (4 s,
filmed by me)", so it must be you who filmed it: a desk, a few objects. Frames are processed in the visitor's
browser like camera frames, but the file itself is public, so keep people and private things out of it.

```bash
ffmpeg -i desk-original.mov -t 4 -vf "scale=-2:480,fps=24" -c:v libx264 -profile:v main -pix_fmt yuv420p \
  -crf 28 -an -movflags +faststart public/media/desk.mp4
ls -l public/media/desk.mp4                   # under 1.5 MB; raise -crf if it is larger
```

## 3. The recorded run: `public/traces/vision.json`

A trace is a REAL run, written by the page itself. Nothing in the repository can produce one for you, and writing
one by hand is forbidden (spec 6.7): the file says what device and when, and the panel shows both.

1. Publish the detector (section 1) and start `pnpm dev` (or `pnpm preview` after a build).
2. Open `/projects/vision/?record=1` on the device you want the trace to describe. A "RECORDER" block appears.
3. Allow the camera (or run the clip), wait until boxes are drawn, press **Start recording**, point the camera at a
   few things for 10 to 20 seconds, press **Stop recording**, then **Download vision.json**.
4. Save the file as `public/traces/vision.json` and commit it.

What is stored, and nothing else: `device` (platform, core count, browser and major version), `date`, the frame size,
whether a detector made the boxes, and for each completed frame its time, boxes (position, class, confidence),
inference time, queue depth and the running drop count. **No picture is stored**, from the camera or otherwise; the
player replays the boxes and timings over the test card and labels it `RECORDED RUN`. A recording stops by itself at
1,800 frames (two minutes at 15 Hz). The panel validates the file and refuses one that is malformed, with the
reason, instead of playing it.

After `pnpm build`, `dist/build-info.json` lists each of the three files above with `present: true` when it is
published; that is what the panel reads, so it never asks the server for a file that is not there (a missing file
would print a 404 in every visitor's console). If a clip or a trace you published does not appear after a build,
check that the `optional` list in `scripts/prerender.mjs` names `media/desk.mp4` and `traces/vision.json`.
