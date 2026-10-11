import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import type { Availability } from '../../../lib/vision/availability.ts'
import { panelStore } from './panel-store.ts'
import { createPipeline, detectorUsable, type DetectorStatus, type Pipeline, type PipelineDeps } from './Pipeline.ts'

/**
 * The camera's lifecycle, driven through the real engine with a fake `mediaDevices` whose permission prompt
 * the test answers when it chooses. Spec 4.4: the stream must stop on Stop, Esc, scrolling away and a hidden
 * tab, and "stop" means every track's `readyState` is `ended`, whatever order the prompts were answered in.
 *
 * The case this file exists for (security finding SEC-1): Esc while the permission prompt is open, press "Use my
 * camera" again, and then the FIRST prompt is answered. That stream belongs to a session that is over, but the
 * engine used to look only at the current phase (which the second start had set back to "starting"), keep the
 * stream, and then lose it when the second answer replaced it: a live track nothing on the page could reach.
 */

// ---- the browser APIs the engine reaches for -----------------------------------------------------------------
// Nothing here decodes or draws anything: the test is about who is holding the camera.

class FakeImageData {
  data: Uint8ClampedArray
  width: number
  height: number
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.data = new Uint8ClampedArray(width * height * 4)
  }
}
const browser = globalThis as unknown as Record<string, unknown>
browser.ImageData = FakeImageData
browser.OffscreenCanvas = class {}
browser.createImageBitmap = async () => ({ width: 320, height: 240, close() {} })
// No capture ever fires: the pipeline sits at "live" without processing frames.
browser.requestAnimationFrame = () => 0
browser.cancelAnimationFrame = () => undefined

class FakeTrack {
  readyState: 'live' | 'ended' = 'live'
  stop() {
    this.readyState = 'ended'
  }
}

class FakeStream {
  readonly tracks = [new FakeTrack(), new FakeTrack()]
  getTracks() {
    return this.tracks
  }
  get live() {
    return this.tracks.some((track) => track.readyState === 'live')
  }
}

interface Prompt {
  /** The `facingMode.ideal` the page asked for. */
  facing: string
  /** The person says yes: the browser hands over a live stream (and the camera light comes on). */
  allow(): FakeStream
  /** The person, or the system, says no. */
  refuse(name: string): void
}

function fakeDevices() {
  const prompts: Prompt[] = []
  const streams: FakeStream[] = []
  return {
    prompts,
    streams,
    /** Streams with a track still live: what the camera light is showing. */
    get live() {
      return streams.filter((stream) => stream.live).length
    },
    getUserMedia(constraints: MediaStreamConstraints) {
      return new Promise<FakeStream>((resolve, reject) => {
        const video = constraints.video
        const ideal = typeof video === 'object' && typeof video.facingMode === 'object' ? (video.facingMode as { ideal?: string }).ideal : undefined
        prompts.push({
          facing: ideal ?? '',
          allow() {
            const stream = new FakeStream()
            streams.push(stream)
            resolve(stream)
            return stream
          },
          refuse(name) {
            reject(new DOMException('refused', name))
          },
        })
      })
    },
    async enumerateDevices() {
      return [{ kind: 'videoinput' }, { kind: 'videoinput' }]
    },
  }
}

/**
 * A real `<video>` goes back to `readyState` 0 (no frames) when it is released; this one deliberately does not, so
 * a session that has ended can never be "kept alive" by the browser quietly resetting the element. The engine has
 * to know for itself that its session is over.
 */
class FakeVideo extends EventTarget {
  srcObject: unknown = null
  src = ''
  loop = false
  readyState = 4
  videoWidth = 640
  videoHeight = 480
  play() {
    return Promise.resolve()
  }
  pause() {}
  load() {}
  removeAttribute() {}
}

/** A scheduler that needs no workers: every job is "done" at once. */
const fakeScheduler = {
  isSupported: () => true,
  ensureService: async () => undefined,
  submit: () => ({ id: 'job', kind: 'vision.warm', promise: Promise.resolve({ ok: true }), cancel() {} }),
  getState: () => ({ nodes: {}, queue: [], spans: [] }),
}

function rig(t: TestContext) {
  const devices = fakeDevices()
  const said: string[] = []
  const video = new FakeVideo()
  const engine = createPipeline({
    scheduler: fakeScheduler as unknown as PipelineDeps['scheduler'],
    announce: (text) => {
      said.push(text)
    },
    mediaDevices: () => devices as unknown as MediaDevices,
  })
  const detach = engine.attach({
    canvas: { width: 320, height: 240, getContext: () => ({ putImageData() {} }) } as unknown as HTMLCanvasElement,
    video: video as unknown as HTMLVideoElement,
  })
  // Whatever a test leaves running, the engine's timer must not keep the process alive.
  t.after(detach)
  return { engine, devices, said, video, detach }
}

/** Let every promise the engine is waiting on run to the end. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

/** Let the engine take `n` steps of whatever it is awaiting, and no more: a Stop can then land between any two of them. */
async function tick(n: number) {
  for (let i = 0; i < n; i++) await Promise.resolve()
}

const phaseOf = (engine: Pipeline) => engine.store.get().phase

/** Every track of every stream the browser ever handed over whose `readyState` is not `ended`, by name (empty: the light is off). */
const liveTracks = (devices: ReturnType<typeof fakeDevices>) =>
  devices.streams.flatMap((stream, s) => stream.tracks.flatMap((track, t) => (track.readyState === 'ended' ? [] : [`stream ${s} track ${t}`])))

// ---- every way of stopping -------------------------------------------------------------------------------------

for (const reason of ['user', 'esc', 'scroll', 'hidden'] as const) {
  test(`stop(${reason}) ends the camera: every track is ended and the picture lets go of the stream`, async (t) => {
    const { engine, devices, video, said } = rig(t)
    const started = engine.startCamera()
    devices.prompts[0].allow()
    await started
    assert.equal(phaseOf(engine), 'live')
    assert.equal(video.srcObject, devices.streams[0])
    assert.equal(devices.live, 1)

    engine.stop(reason)
    assert.equal(devices.live, 0, 'no track may stay live')
    for (const track of devices.streams[0].tracks) assert.equal(track.readyState, 'ended')
    assert.equal(video.srcObject, null)
    assert.equal(phaseOf(engine), 'idle')
    assert.deepEqual(engine.store.get().message, { kind: 'stopped', why: reason })
    assert.ok(said.some((text) => /stopped/i.test(text)), 'the stop is announced')
  })
}

test('unmounting the demo ends the camera too', async (t) => {
  const { engine, devices, video, detach } = rig(t)
  const started = engine.startCamera()
  devices.prompts[0].allow()
  await started
  detach()
  assert.equal(devices.live, 0)
  assert.equal(video.srcObject, null)
})

test('asking for the camera again while it is on replaces it: the old stream ends when the new one is asked for', async (t) => {
  const { engine, devices } = rig(t)
  const first = engine.startCamera()
  devices.prompts[0].allow()
  await first
  const second = engine.startCamera()
  assert.equal(devices.live, 0, 'the old stream is stopped before the new prompt is even answered')
  devices.prompts[1].allow()
  await second
  assert.equal(devices.live, 1)
  engine.stop('user')
  assert.equal(devices.live, 0)
})

// ---- the race: an answer that arrives after its session is over -------------------------------------------------

test('SEC-1: Esc while the prompt is open, start again, then the FIRST answer arrives late: that stream is stopped, never orphaned', async (t) => {
  const { engine, devices, video } = rig(t)
  const first = engine.startCamera()
  assert.equal(devices.prompts.length, 1)
  engine.stop('esc') // Esc while the permission prompt is open
  const second = engine.startCamera() // "Use my camera" again
  assert.equal(devices.prompts.length, 2)
  assert.equal(phaseOf(engine), 'starting')

  const late = devices.prompts[0].allow() // the person finally answers the first prompt
  await first
  assert.equal(late.live, false, 'it was asked for by a session that Esc ended: stop it on arrival')
  assert.equal(video.srcObject, null, 'and never show it')
  assert.equal(phaseOf(engine), 'starting', 'the newer start is unaffected')

  const current = devices.prompts[1].allow()
  await second
  assert.equal(phaseOf(engine), 'live')
  assert.equal(video.srcObject, current)
  assert.equal(devices.live, 1, 'only the current stream is live')

  engine.stop('esc')
  assert.equal(devices.live, 0, 'after the final Esc the camera light is off')
  assert.deepEqual(liveTracks(devices), [], 'every track of both streams is ended')
  assert.equal(video.srcObject, null)
})

test('SEC-1: the same race when both answers arrive in the same instant, the newer one first', async (t) => {
  const { engine, devices, video } = rig(t)
  const first = engine.startCamera()
  engine.stop('esc')
  const second = engine.startCamera()
  const newer = devices.prompts[1].allow()
  const older = devices.prompts[0].allow() // delivered before the newer start has finished starting
  await Promise.all([first, second])
  assert.equal(older.live, false)
  assert.equal(newer.live, true)
  assert.equal(video.srcObject, newer, 'the picture shows the newer stream, not the one that arrived last')
  engine.stop('esc')
  assert.equal(devices.live, 0)
})

test('SEC-1: an answer that arrives after Stop, with nothing started since, is stopped and does not turn the camera on', async (t) => {
  const { engine, devices, video } = rig(t)
  const started = engine.startCamera()
  engine.stop('user')
  const late = devices.prompts[0].allow()
  await started
  assert.equal(late.live, false)
  assert.equal(video.srcObject, null)
  assert.equal(phaseOf(engine), 'idle')
  assert.deepEqual(engine.store.get().message, { kind: 'stopped', why: 'user' })
})

test('SEC-1: flipping the camera twice before the first answer: only the last camera is left running, in either order of arrival', async (t) => {
  for (const newestFirst of [false, true]) {
    const { engine, devices, video } = rig(t)
    const started = engine.startCamera()
    devices.prompts[0].allow()
    await started
    const rear = devices.streams[0]

    const flipA = engine.flipCamera() // to the front camera
    assert.equal(rear.live, false, 'the rear camera is released as soon as the flip begins')
    const flipB = engine.flipCamera() // and straight back
    assert.deepEqual(
      devices.prompts.map((prompt) => prompt.facing),
      ['environment', 'user', 'environment'],
    )

    const answers = [devices.prompts[1], devices.prompts[2]]
    if (newestFirst) answers.reverse()
    const streams = answers.map((prompt) => prompt.allow())
    await Promise.all([flipA, flipB])
    assert.equal(streams.filter((stream) => stream.live).length, 1, 'exactly one of the two answers is left running')
    assert.equal(devices.live, 1)
    assert.equal(video.srcObject, devices.streams.find((stream) => stream.live), 'and it is the one on the picture')
    assert.equal(engine.store.get().facing, 'environment')
    assert.equal(phaseOf(engine), 'live')

    engine.stop('esc')
    assert.deepEqual(liveTracks(devices), [], `no live track after Esc (newest answered first: ${newestFirst})`)
    assert.equal(video.srcObject, null)
  }
})

test('SEC-1: unmounting while the prompt is open, then the answer: the stream is stopped', async (t) => {
  const { engine, devices, video, detach } = rig(t)
  const started = engine.startCamera()
  detach()
  const late = devices.prompts[0].allow()
  await started
  assert.equal(late.live, false)
  assert.equal(video.srcObject, null)
})

test('SEC-1: another source replaces the camera while its prompt is open: the late stream is stopped', async (t) => {
  const { engine, devices } = rig(t)
  engine.setAvailability({ detector: null, runtimeBytes: null, trace: false, clip: true })
  const camera = engine.startCamera()
  const clip = engine.startClip()
  const late = devices.prompts[0].allow()
  await Promise.all([camera, clip])
  assert.equal(late.live, false)
  assert.equal(engine.store.get().source, 'clip')
  engine.stop('user')
  assert.equal(devices.live, 0)
})

// ---- refusals ---------------------------------------------------------------------------------------------------

test('a refused prompt says so and leaves nothing running; asking again afterwards works', async (t) => {
  const { engine, devices } = rig(t)
  const first = engine.startCamera()
  devices.prompts[0].refuse('NotAllowedError')
  await first
  assert.deepEqual(engine.store.get().message, { kind: 'denied' })
  assert.equal(phaseOf(engine), 'idle')
  assert.equal(devices.live, 0)

  const second = engine.startCamera()
  devices.prompts[1].allow()
  await second
  assert.equal(phaseOf(engine), 'live')
  assert.equal(devices.live, 1)
})

test('a refusal that arrives after Stop does not overwrite the status line', async (t) => {
  const { engine, devices } = rig(t)
  const started = engine.startCamera()
  engine.stop('user')
  devices.prompts[0].refuse('NotAllowedError')
  await started
  assert.deepEqual(engine.store.get().message, { kind: 'stopped', why: 'user' })
})

test('a refused camera only points the visitor at "drop an image" where that is on offer', async (t) => {
  const nothing: Availability = { detector: null, runtimeBytes: null, trace: false, clip: false }
  const published: Availability = { ...nothing, detector: { inputSize: 320, bytes: 3_500_000, quant: 'int8', classes: ['person'] } }
  for (const [availability, offered] of [
    [nothing, false],
    [published, true],
  ] as const) {
    const { engine, devices, said } = rig(t)
    engine.setAvailability(availability)
    const started = engine.startCamera()
    devices.prompts[0].refuse('NotAllowedError')
    await started
    const line = said.at(-1) ?? ''
    assert.match(line, /camera is blocked/i)
    assert.equal(/drop an image/i.test(line), offered, line)
  }
})

// ---- any order of anything -------------------------------------------------------------------------------------

/** xorshift32: the same sequence on every run, so a failure can be replayed. */
function seeded(seed: number) {
  let x = seed | 0 || 1
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 0x100000000
  }
}

/** How many seeded sequences the property test tries. */
const SEQUENCES = 150

test('property: after any mix of starts, flips, stops, unmounts and late answers, a final stop leaves no live track', async (t) => {
  const reasons = ['user', 'esc', 'scroll', 'hidden'] as const
  for (let seed = 1; seed <= SEQUENCES; seed++) {
    const random = seeded(seed * 7919)
    const { engine, devices, video, detach } = rig(t)
    const pick = (n: number) => Math.floor(random() * n)
    const log: string[] = []
    const settled: Array<Promise<void>> = []
    const answered = new Set<number>()
    const waiting = () => devices.prompts.map((_, index) => index).filter((index) => !answered.has(index))

    steps: for (let step = 0, steps = 4 + pick(22); step < steps; step++) {
      // start 5, flip 2, stop 4, a pause 2, allow 5, refuse 1, unmount 1
      const action = pick(20)
      if (action < 5) {
        log.push('start')
        settled.push(engine.startCamera())
      } else if (action < 7) {
        log.push('flip')
        settled.push(engine.flipCamera())
      } else if (action < 11) {
        const reason = reasons[pick(reasons.length)]
        log.push(`stop(${reason})`)
        engine.stop(reason)
      } else if (action < 13) {
        log.push('pause')
      } else if (action < 19) {
        const open = waiting()
        if (open.length === 0) continue
        const index = open[pick(open.length)]
        answered.add(index)
        if (action === 18) {
          log.push(`refuse #${index}`)
          devices.prompts[index].refuse('NotAllowedError')
        } else {
          log.push(`allow #${index}`)
          devices.prompts[index].allow()
        }
      } else {
        log.push('unmount')
        detach()
        break steps // an unmounted demo is not mounted again
      }
      // Sometimes the engine gets no time before the next action, sometimes a few steps, sometimes all it needs.
      const time = pick(4)
      if (time === 1) await tick(1 + pick(5))
      else if (time === 2) await settle()
    }
    log.push('stop(esc)')
    engine.stop('esc')
    for (const index of waiting()) devices.prompts[index].allow() // everything still waiting is answered after the end
    await Promise.all(settled)
    await settle()
    const where = `seed ${seed}: ${log.join(', ')}`
    assert.deepEqual(liveTracks(devices), [], `a camera track is still live after the final Esc (${where})`)
    assert.equal(video.srcObject, null, `the picture still holds a stream (${where})`)
    assert.equal(phaseOf(engine), 'idle', `the engine is not idle (${where})`)
    detach()
  }
})

// ---- what the panel is told about the detector (finding R1) ------------------------------------------------------

test('a detector counts as usable only when one ships, has not failed here, and this browser can run it', () => {
  const expected: Record<DetectorStatus, boolean> = {
    unknown: false, // not read yet: promise nothing
    absent: false, // nothing published: no drop-an-image, and the dialog says nothing will be recognised
    available: true,
    loading: true,
    ready: true,
    failed: false,
  }
  for (const [status, usable] of Object.entries(expected)) {
    assert.equal(detectorUsable(status as DetectorStatus, true), usable, status)
    assert.equal(detectorUsable(status as DetectorStatus, false), false, `${status} without WebAssembly SIMD: the runtime cannot start`)
  }
})

test('the build inventory decides what the panel says: unknown until read, then absent or published', (t) => {
  const { engine } = rig(t)
  panelStore.patch({ detector: 'unknown' })
  assert.equal(engine.store.get().detector.status, 'unknown')

  const nothing: Availability = { detector: null, runtimeBytes: null, trace: false, clip: false }
  engine.setAvailability(nothing)
  assert.equal(engine.store.get().detector.status, 'absent')
  assert.equal(panelStore.get().detector, 'absent')

  engine.setAvailability({ ...nothing, detector: { inputSize: 320, bytes: 3_500_000, quant: 'int8', classes: ['person'] }, runtimeBytes: 14_000_000 })
  assert.equal(engine.store.get().detector.status, 'available')
  assert.equal(panelStore.get().detector, 'published')
})
