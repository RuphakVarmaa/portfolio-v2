import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BAYER4, ditherBayer4, fitInBox, fitToWidth, fitWithin, orderTones, parseColor, thumbnailBayer, toneChart, type Rgb } from './Dither.ts'

const INK: Rgb = [28, 27, 24]
const PAPER: Rgb = [243, 238, 228]

/** An RGBA image of one grey level. */
const flat = (level: number, width: number, height: number) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = level
    data[i + 3] = 255
  }
  return data
}

const isInk = (data: Uint8ClampedArray, pixel: number) => data[pixel * 4] === INK[0] && data[pixel * 4 + 1] === INK[1] && data[pixel * 4 + 2] === INK[2]
const inkShare = (data: Uint8ClampedArray) => {
  let ink = 0
  const pixels = data.length / 4
  for (let p = 0; p < pixels; p++) if (isInk(data, p)) ink += 1
  return ink / pixels
}

test('the Bayer matrix holds each threshold 0..15 exactly once', () => {
  assert.equal(BAYER4.length, 16)
  assert.deepEqual([...BAYER4].sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i))
})

test('black is all ink and white is all paper', () => {
  assert.equal(inkShare(ditherBayer4(flat(0, 16, 8), 16, 8, INK, PAPER)), 1)
  assert.equal(inkShare(ditherBayer4(flat(255, 16, 8), 16, 8, INK, PAPER)), 0)
})

test('grey levels give the matching share of ink: darker means more ink, in sixteenths', () => {
  // Thresholds are (v * 16 + 8) for v = 0..15: 8, 24, ..., 248. A pixel is ink when luma < threshold.
  assert.equal(inkShare(ditherBayer4(flat(128, 16, 16), 16, 16, INK, PAPER)), 8 / 16, 'mid grey is half ink')
  assert.equal(inkShare(ditherBayer4(flat(64, 16, 16), 16, 16, INK, PAPER)), 12 / 16, 'dark grey is mostly ink')
  assert.equal(inkShare(ditherBayer4(flat(192, 16, 16), 16, 16, INK, PAPER)), 4 / 16, 'light grey is mostly paper')
})

test('every output pixel is exactly ink or paper and fully opaque', () => {
  const noisy = new Uint8ClampedArray(20 * 10 * 4)
  for (let i = 0; i < noisy.length; i++) noisy[i] = (i * 37 + 11) % 256
  const out = ditherBayer4(noisy, 20, 10, INK, PAPER)
  for (let p = 0; p < 200; p++) {
    const rgb = [out[p * 4], out[p * 4 + 1], out[p * 4 + 2]]
    assert.ok(JSON.stringify(rgb) === JSON.stringify(INK) || JSON.stringify(rgb) === JSON.stringify(PAPER))
    assert.equal(out[p * 4 + 3], 255)
  }
})

test('the dither is deterministic, uses the position (not randomness) and leaves the source untouched', () => {
  const src = flat(100, 9, 7) // sizes that are not multiples of 4
  const copy = src.slice()
  const a = ditherBayer4(src, 9, 7, INK, PAPER)
  const b = ditherBayer4(src, 9, 7, INK, PAPER)
  assert.deepEqual(a, b)
  assert.deepEqual(src, copy)
  // The pattern repeats every 4 pixels in both directions.
  assert.equal(isInk(a, 0), isInk(a, 4))
  assert.equal(isInk(a, 1), isInk(a, 5))
  assert.equal(isInk(a, 0), isInk(a, 4 * 9))
})

test('an output buffer can be reused, and a wrong-sized one is refused', () => {
  const src = flat(0, 4, 4)
  const out = new Uint8ClampedArray(4 * 4 * 4)
  assert.equal(ditherBayer4(src, 4, 4, INK, PAPER, out), out)
  assert.throws(() => ditherBayer4(src, 4, 4, INK, PAPER, new Uint8ClampedArray(8)), RangeError)
  assert.throws(() => ditherBayer4(new Uint8ClampedArray(8), 4, 4, INK, PAPER), RangeError)
})

test('colour tokens parse from hex (3 and 6 digit), rgb(), and with stray whitespace', () => {
  assert.deepEqual(parseColor('#f3eee4'), [243, 238, 228])
  assert.deepEqual(parseColor(' #1C1B18 '), [28, 27, 24])
  assert.deepEqual(parseColor('#fff'), [255, 255, 255])
  assert.deepEqual(parseColor('rgb(10, 20, 30)'), [10, 20, 30])
  assert.deepEqual(parseColor('rgb(10 20 30)'), [10, 20, 30])
  assert.equal(parseColor('color-mix(in oklab, red, blue)'), null)
  assert.equal(parseColor(''), null)
  assert.equal(parseColor('#12345'), null)
})

test('the tone chart is a black-to-white ramp over steps and two grey stripes, opaque, and the same every time', () => {
  const w = 160
  const h = 100
  const chart = toneChart(w, h)
  assert.equal(chart.length, w * h * 4)
  assert.deepEqual(chart, toneChart(w, h))
  const at = (x: number, y: number) => chart[(y * w + x) * 4]
  assert.equal(at(0, 5), 0)
  assert.equal(at(w - 1, 5), 255)
  assert.ok(at(w / 2, 5) > 120 && at(w / 2, 5) < 135, 'the ramp is smooth')
  assert.equal(at(0, 70), 0, 'first step')
  assert.equal(at(w - 1, 70), 255, 'last step')
  assert.equal(at(10, 95), 64)
  assert.equal(at(w - 10, 95), 191)
  assert.equal(chart[3], 255)
  // Dithered, the ramp gets steadily darker-to-lighter: ink share falls left to right.
  const out = ditherBayer4(chart, w, h, INK, PAPER)
  const share = (x0: number, x1: number) => {
    let ink = 0
    let n = 0
    for (let y = 0; y < 50; y++) for (let x = x0; x < x1; x++, n++) if (isInk(out, y * w + x)) ink += 1
    return ink / n
  }
  assert.ok(share(0, 40) > share(40, 80) && share(40, 80) > share(80, 120) && share(80, 120) > share(120, 160))
})

test('a frame is fitted inside the capture box without upscaling or distortion', () => {
  assert.deepEqual(fitWithin(640, 480, 320), { width: 320, height: 240 })
  assert.deepEqual(fitWithin(480, 640, 320), { width: 240, height: 320 })
  assert.deepEqual(fitWithin(1920, 1080, 320), { width: 320, height: 180 })
  assert.deepEqual(fitWithin(200, 100, 320), { width: 200, height: 100 }, 'never upscaled')
  assert.deepEqual(fitWithin(0, 0, 320), { width: 320, height: 240 }, 'an unknown size falls back to 4:3')
})

test('the darker ink is always the one dark pixels become, in the paper theme and in the ink theme', () => {
  // Paper theme: ink #1c1b18 on paper #f3eee4. Ink theme: ink #ece6d8 on paper #141311 (the roles swap).
  assert.deepEqual(orderTones([28, 27, 24], [243, 238, 228]), { dark: [28, 27, 24], light: [243, 238, 228] })
  assert.deepEqual(orderTones([236, 230, 216], [20, 19, 17]), { dark: [20, 19, 17], light: [236, 230, 216] })
  // So a black frame stays the darker colour in both themes: a dark object never turns into its negative.
  const tones = orderTones([236, 230, 216], [20, 19, 17])
  const black = ditherBayer4(flat(0, 4, 4), 4, 4, tones.dark, tones.light)
  assert.deepEqual([black[0], black[1], black[2]], [20, 19, 17])
})

test('a thumbnail of a flat grey has the same share of ink as the full-size dither of that grey', () => {
  for (const level of [0, 64, 128, 192, 255]) {
    const small = thumbnailBayer(flat(level, 320, 240), 320, 240, 64, 48, INK, PAPER)
    assert.equal(inkShare(small), inkShare(ditherBayer4(flat(level, 64, 48), 64, 48, INK, PAPER)), `grey ${level}`)
  }
})

test('a thumbnail keeps the layout: a dark left half and a light right half stay on their sides', () => {
  const src = new Uint8ClampedArray(320 * 240 * 4)
  for (let y = 0; y < 240; y++) {
    for (let x = 0; x < 320; x++) {
      const i = (y * 320 + x) * 4
      src[i] = src[i + 1] = src[i + 2] = x < 160 ? 0 : 255
      src[i + 3] = 255
    }
  }
  const out = thumbnailBayer(src, 320, 240, 64, 48, INK, PAPER)
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 64; x++) assert.equal(isInk(out, y * 64 + x), x < 32, `pixel ${x},${y}`)
  }
})

test('averaging keeps a thin bright line from vanishing (a plain every-fifth-pixel sample would miss it)', () => {
  const src = new Uint8ClampedArray(320 * 240 * 4)
  for (let i = 0; i < src.length; i += 4) {
    src[i] = src[i + 1] = src[i + 2] = 0
    src[i + 3] = 255
  }
  // A one-pixel-wide white column at x = 2 of every 5: the first source pixel a point sample would skip.
  for (let y = 0; y < 240; y++) {
    for (let x = 2; x < 320; x += 5) {
      const i = (y * 320 + x) * 4
      src[i] = src[i + 1] = src[i + 2] = 255
    }
  }
  const out = thumbnailBayer(src, 320, 240, 64, 48, INK, PAPER)
  // Each cell averages to 51 (one white pixel in five): lighter than black, so some cells are paper.
  assert.ok(inkShare(out) < 1)
  assert.ok(inkShare(out) > 0.5, 'but still mostly ink')
})

test('a thumbnail is deterministic, opaque, uses only the two inks, and checks its buffers', () => {
  const src = toneChart(320, 240)
  const a = thumbnailBayer(src, 320, 240, 64, 48, INK, PAPER)
  const b = thumbnailBayer(src, 320, 240, 64, 48, INK, PAPER)
  assert.deepEqual(a, b)
  for (let p = 0; p < 64 * 48; p++) {
    assert.equal(a[p * 4 + 3], 255)
    assert.ok(isInk(a, p) || (a[p * 4] === PAPER[0] && a[p * 4 + 1] === PAPER[1] && a[p * 4 + 2] === PAPER[2]))
  }
  assert.throws(() => thumbnailBayer(src, 320, 240, 64, 48, INK, PAPER, new Uint8ClampedArray(10)), RangeError)
  assert.throws(() => thumbnailBayer(new Uint8ClampedArray(10), 320, 240, 64, 48, INK, PAPER), RangeError)
})

test('a portrait frame fits a small box without distortion', () => {
  assert.deepEqual(fitWithin(240, 320, 64), { width: 48, height: 64 })
  assert.deepEqual(fitWithin(320, 240, 64), { width: 64, height: 48 })
})

test('a frame fits a card-shaped box on its limiting side, whatever its orientation', () => {
  assert.deepEqual(fitInBox(320, 240, 81, 60), { width: 80, height: 60 }, 'landscape: the height limits it')
  assert.deepEqual(fitInBox(240, 320, 81, 60), { width: 45, height: 60 }, 'portrait: still inside the card')
  assert.deepEqual(fitInBox(320, 180, 80, 60), { width: 80, height: 45 }, 'wide: the width limits it')
  assert.deepEqual(fitInBox(0, 0, 80, 60), { width: 80, height: 60 }, 'nothing to measure: the whole box')
})

test('the stage shrinks a frame by its width only, and never enlarges it', () => {
  assert.deepEqual(fitToWidth(320, 240, 272), { width: 272, height: 204 }, 'landscape on a narrow phone')
  assert.deepEqual(fitToWidth(320, 240, 640), { width: 320, height: 240 }, 'plenty of room: its own size')
  assert.deepEqual(fitToWidth(180, 320, 272), { width: 180, height: 320 }, 'portrait is narrow already: it keeps its full height')
  assert.deepEqual(fitToWidth(180, 320, 120), { width: 120, height: 213 }, 'unless even its width does not fit')
  assert.deepEqual(fitToWidth(0, 0, 200), { width: 200, height: 150 })
})
