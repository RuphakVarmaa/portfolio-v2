import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRecorder, describeDevice, recordingRequested } from './Recorder.ts'
import { MAX_TRACE_FRAMES, parseTrace } from './TracePlayer.ts'

const box = { x: 1, y: 2, w: 3, h: 4, cls: 'cup', conf: 0.5 }

test('recording is only requested by ?record=1', () => {
  assert.equal(recordingRequested('?record=1'), true)
  assert.equal(recordingRequested('?a=b&record=1'), true)
  assert.equal(recordingRequested(''), false)
  assert.equal(recordingRequested('?record=0'), false)
  assert.equal(recordingRequested('?record'), false)
  assert.equal(recordingRequested('?norecord=1'), false)
})

test('a recording carries the device and date it was made with, and times relative to the start', () => {
  const recorder = createRecorder({ device: () => 'test device', date: () => new Date('2026-03-04T05:06:07.000Z') })
  assert.equal(recorder.toTrace(), null, 'nothing recorded yet')
  recorder.start({ width: 320, height: 240, detector: true }, 1000)
  recorder.add({ at: 1000, boxes: [box], inferMs: 41.26, depth: 1, dropped: 0 })
  recorder.add({ at: 1066.66, boxes: [], inferMs: 39, depth: 0, dropped: 2 })
  const trace = recorder.toTrace()
  assert.ok(trace)
  assert.equal(trace.device, 'test device')
  assert.equal(trace.date, '2026-03-04T05:06:07.000Z')
  assert.deepEqual([trace.width, trace.height, trace.detector], [320, 240, true])
  assert.deepEqual(trace.frames.map((f) => f.t), [0, 66.7])
  assert.equal(trace.frames[0].inferMs, 41.3)
  assert.equal(trace.frames[1].dropped, 2)
})

test('what the recorder writes is exactly what the player accepts', () => {
  const recorder = createRecorder({ device: () => 'd' })
  recorder.start({ width: 320, height: 240, detector: false }, 0)
  for (let i = 0; i < 20; i++) recorder.add({ at: i * 66, boxes: i % 2 ? [box] : [], inferMs: 0, depth: i % 4, dropped: i })
  const json = recorder.toJson()
  assert.ok(json)
  const parsed = parseTrace(JSON.parse(json))
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.equal(parsed.trace.frames.length, 20)
})

test('frames are ignored unless a recording is running', () => {
  const recorder = createRecorder({ device: () => 'd' })
  recorder.add({ at: 0, boxes: [], inferMs: 1, depth: 0, dropped: 0 })
  assert.equal(recorder.count, 0)
  recorder.start({ width: 10, height: 10, detector: true }, 0)
  recorder.add({ at: 5, boxes: [], inferMs: 1, depth: 0, dropped: 0 })
  recorder.stop()
  recorder.add({ at: 9, boxes: [], inferMs: 1, depth: 0, dropped: 0 })
  assert.equal(recorder.count, 1)
  assert.equal(recorder.recording, false)
  assert.ok(recorder.toTrace(), 'a stopped recording can still be downloaded')
})

test('starting again discards the previous recording; clear() discards everything', () => {
  const recorder = createRecorder({ device: () => 'd' })
  recorder.start({ width: 10, height: 10, detector: true }, 0)
  recorder.add({ at: 1, boxes: [], inferMs: 1, depth: 0, dropped: 0 })
  recorder.start({ width: 10, height: 10, detector: true }, 100)
  assert.equal(recorder.count, 0)
  recorder.add({ at: 150, boxes: [], inferMs: 1, depth: 0, dropped: 0 })
  assert.equal(recorder.toTrace()?.frames[0].t, 50)
  recorder.clear()
  assert.equal(recorder.toTrace(), null)
  assert.equal(recorder.toJson(), null)
})

test('the recorder stops itself at the frame cap and says it is full', () => {
  const recorder = createRecorder({ device: () => 'd' })
  recorder.start({ width: 10, height: 10, detector: true }, 0)
  for (let i = 0; i < MAX_TRACE_FRAMES + 50; i++) recorder.add({ at: i, boxes: [], inferMs: 1, depth: 0, dropped: 0 })
  assert.equal(recorder.count, MAX_TRACE_FRAMES)
  assert.equal(recorder.full, true)
  assert.equal(recorder.recording, false)
  assert.equal(parseTrace(JSON.parse(recorder.toJson() ?? 'null')).ok, true, 'a full recording is still a valid trace')
})

test('the device description names the platform, the cores and the browser, and nothing identifying', () => {
  assert.equal(
    describeDevice({
      platform: 'MacIntel',
      hardwareConcurrency: 10,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
      userAgentData: {
        platform: 'macOS',
        brands: [
          { brand: 'Not.A/Brand', version: '99' },
          { brand: 'Chromium', version: '154' },
          { brand: 'Google Chrome', version: '154' },
        ],
      },
    }),
    'macOS, 10 cores, Google Chrome 154',
  )
  assert.equal(
    describeDevice({ platform: 'Linux armv81', hardwareConcurrency: 8, userAgent: 'Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/130.0' }),
    'Linux armv81, 8 cores, Firefox 130',
  )
  assert.equal(
    describeDevice({ platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' }),
    'iPhone, Safari 17',
  )
  assert.equal(describeDevice({}), 'unknown device')
})
