import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_TRACE_FRAMES, createTracePlayer, parseTrace, type TraceFile } from './TracePlayer.ts'

/**
 * TEST FIXTURE ONLY. These frames exist to exercise the parser and the player's arithmetic. They are never
 * shipped and never shown on the site: the site only ever plays a file the recorder wrote on a real run.
 */
function fixture(overrides: Partial<TraceFile> = {}): TraceFile {
  return {
    device: 'test fixture',
    date: '2026-01-01T00:00:00.000Z',
    width: 320,
    height: 240,
    detector: true,
    frames: Array.from({ length: 10 }, (_, i) => ({
      t: i * 100,
      boxes: [{ x: 10, y: 20, w: 30, h: 40, cls: 'person', conf: 0.9 }],
      inferMs: 40 + i,
      depth: i % 3,
      dropped: Math.floor(i / 4),
    })),
    ...overrides,
  }
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

test('a well-formed trace parses and survives a JSON round trip unchanged', () => {
  const result = parseTrace(clone(fixture()))
  assert.equal(result.ok, true)
  if (result.ok) assert.deepEqual(result.trace, fixture())
})

test('malformed files are refused with the reason', () => {
  const cases: Array<[string, (t: Record<string, unknown>) => void, RegExp]> = [
    ['no device', (t) => delete t.device, /device/],
    ['bad date', (t) => (t.date = 'last tuesday'), /date/],
    ['no size', (t) => (t.width = 0), /width and height/],
    ['detector not boolean', (t) => (t.detector = 'yes'), /detector/],
    ['no frames', (t) => (t.frames = []), /no frames/],
    ['frames not a list', (t) => (t.frames = {}), /no frames/],
    ['time goes backwards', (t) => ((t.frames as Array<{ t: number }>)[3].t = 5), /bad time/],
    ['negative inferMs', (t) => ((t.frames as Array<{ inferMs: number }>)[0].inferMs = -1), /inferMs/],
    ['fractional depth', (t) => ((t.frames as Array<{ depth: number }>)[0].depth = 1.5), /depth/],
    ['no boxes list', (t) => delete (t.frames as Array<Record<string, unknown>>)[0].boxes, /boxes list/],
    ['box confidence over 1', (t) => ((t.frames as Array<{ boxes: Array<{ conf: number }> }>)[0].boxes[0].conf = 1.5), /malformed box/],
    ['box without a class', (t) => ((t.frames as Array<{ boxes: Array<{ cls: string }> }>)[0].boxes[0].cls = ''), /malformed box/],
  ]
  for (const [name, mutate, message] of cases) {
    const bad = clone(fixture()) as unknown as Record<string, unknown>
    mutate(bad)
    const result = parseTrace(bad)
    assert.equal(result.ok, false, name)
    if (!result.ok) assert.match(result.error, message, name)
  }
  assert.equal(parseTrace(null).ok, false)
  assert.equal(parseTrace([]).ok, false)
  assert.equal(parseTrace('{}').ok, false)
})

test('a recording longer than the cap is refused', () => {
  const frames = Array.from({ length: MAX_TRACE_FRAMES + 1 }, (_, i) => ({ t: i, boxes: [], inferMs: 1, depth: 0, dropped: 0 }))
  const result = parseTrace(clone(fixture({ frames })))
  assert.equal(result.ok, false)
})

test('the player returns the last frame at or before the time, and nothing before the first frame', () => {
  const player = createTracePlayer(fixture())
  assert.equal(player.duration, 900)
  assert.equal(player.at(-1), null)
  assert.equal(player.at(0)?.index, 0)
  assert.equal(player.at(99)?.index, 0)
  assert.equal(player.at(100)?.index, 1)
  assert.equal(player.at(450)?.index, 4)
  assert.equal(player.at(900)?.index, 9)
  assert.equal(player.at(5000)?.index, 9, 'after the end it holds the last frame')
})

test('the reading carries the recorded boxes, depth and drops and a p95 over the frames so far', () => {
  const player = createTracePlayer(fixture())
  const reading = player.at(450)
  assert.ok(reading)
  assert.equal(reading.frame.depth, 4 % 3)
  assert.equal(reading.frame.dropped, 1)
  assert.equal(reading.frame.boxes[0].cls, 'person')
  // inferMs of frames 0..4 are 40..44; the nearest-rank p95 of five values is the largest.
  assert.equal(reading.p95, 44)
})

test('a queue-only recording has no p95 and says so', () => {
  const player = createTracePlayer(fixture({ detector: false }))
  assert.equal(player.at(500)?.p95, null)
})

test('the replayed frame rate is read from the recorded times: ten frames a second', () => {
  const frames = Array.from({ length: 80 }, (_, i) => ({ t: i * 100, boxes: [], inferMs: 30, depth: 0, dropped: 0 }))
  const player = createTracePlayer(fixture({ frames }))
  assert.equal(player.at(0)?.fps, null, 'too early to say')
  const fps = player.at(7000)?.fps
  assert.ok(fps !== null && fps !== undefined && Math.abs(fps - 10) < 0.5, `expected about 10, got ${String(fps)}`)
})
