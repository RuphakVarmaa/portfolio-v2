import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, mock, test } from 'node:test'
import { goToId, holdOnTarget } from './motion.ts'

/**
 * The landing is the part of the page that has to survive a page that grows under it, a visitor who scrolls, and the Back
 * button, none of which `node --test` has a browser for. So this is a small fake of exactly what `goToId` touches: one
 * scroller (`window`), one document, elements with a top edge, a resize observer the test can fire, and fake timers. It checks the
 * decisions (smooth or jump, hold or watch, who ends whom), not pixels; the pixels were measured in Chrome.
 */

type Listener = () => void

interface FakeElement {
  id: string
  isConnected: boolean
  /** Distance from the top of the viewport (negative: above it). */
  top: number
  scrollIntoViewCalls: Array<{ behavior?: string; block?: string }>
  getBoundingClientRect(): { top: number }
  scrollIntoView(options?: { behavior?: string; block?: string }): void
  querySelector(): { focus(options?: unknown): void } | null
}

const PADDING = 76
const VIEWPORT = 800
let scrollY = 0
let listeners: Map<string, Set<Listener>>
let observers: Array<{ fire(): void; disconnected: boolean }>
let elements: Map<string, FakeElement>
let motion: string
let scrollBehavior: string

function element(id: string, top: number): FakeElement {
  const el: FakeElement = {
    id,
    isConnected: true,
    top,
    scrollIntoViewCalls: [],
    getBoundingClientRect: () => ({ top: el.top }),
    scrollIntoView(options = {}) {
      el.scrollIntoViewCalls.push({ ...options, ...(options.behavior === undefined ? { behavior: scrollBehavior } : {}) })
      // `behavior: smooth` is a movement that takes a while; anything else is where the element ends up at once.
      if (el.scrollIntoViewCalls.at(-1)?.behavior !== 'smooth') {
        scrollY += el.top - PADDING
        el.top = PADDING
      }
    },
    querySelector: () => ({ focus() {} }),
  }
  elements.set(id, el)
  return el
}

const count = (type: string) => listeners.get(type)?.size ?? 0
const dispatch = (type: string) => [...(listeners.get(type) ?? [])].forEach((listener) => listener())

// One mock clock for the whole file: its timer ids keep counting, so a landing that was ended by an earlier test can never have its
// stale id clear a timer of the next one (they would restart from 1 if the clock were enabled per test).
before(() => mock.timers.enable({ apis: ['setTimeout'] }))
after(() => mock.timers.reset())

beforeEach(() => {
  scrollY = 0
  listeners = new Map()
  observers = []
  elements = new Map()
  motion = 'full'
  scrollBehavior = 'smooth'
  const root = {
    style: {
      get scrollBehavior() {
        return scrollBehavior
      },
      set scrollBehavior(value: string) {
        scrollBehavior = value
      },
    },
    get dataset() {
      return { motion }
    },
  }
  Object.assign(globalThis, {
    document: { documentElement: root, getElementById: (id: string) => elements.get(id) ?? null },
    getComputedStyle: () => ({ scrollPaddingTop: `${PADDING}px` }),
    ResizeObserver: class {
      disconnected = false
      callback: () => void
      constructor(callback: () => void) {
        this.callback = callback
        observers.push(this as unknown as { fire(): void; disconnected: boolean })
      }
      observe() {}
      disconnect() {
        this.disconnected = true
      }
      fire() {
        if (!this.disconnected) this.callback()
      }
    },
  })
  Object.assign(globalThis, {
    window: {
      innerHeight: VIEWPORT,
      get scrollY() {
        return scrollY
      },
      scrollBy(_x: number, y: number) {
        scrollY += y
        // Whatever sits in the page moves with the scroll.
        for (const el of elements.values()) el.top -= y
      },
      addEventListener(type: string, listener: Listener) {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)?.add(listener)
      },
      removeEventListener(type: string, listener: Listener) {
        listeners.get(type)?.delete(listener)
      },
    },
  })
})

afterEach(() => {
  // End whatever landing a test left running (a change of the address ends any), so the next one starts clean.
  mock.timers.tick(1)
  dispatch('hashchange')
  for (const key of ['document', 'window', 'getComputedStyle', 'ResizeObserver'] as const) Reflect.deleteProperty(globalThis, key)
})

/** The next task: arms the visitor-input listeners (they must not see the event that started the landing). */
const nextTask = () => mock.timers.tick(1)

test('a target within three screens is scrolled to smoothly, and the landing is watched', () => {
  const near = element('service-vision', 1500)
  assert.equal(goToId('service-vision'), true)
  assert.deepEqual(near.scrollIntoViewCalls, [{ behavior: 'smooth', block: 'start' }])
  assert.equal(observers.length, 0, 'a smooth scroll is watched by polling its rest, not held')
  nextTask()
  assert.equal(count('wheel'), 1, 'the visitor scrolling ends the landing')
})

test('a target more than three screens away is jumped to at once and held, not scrolled through every panel', () => {
  const far = element('contact', 3 * VIEWPORT + 400)
  assert.equal(goToId('contact'), true)
  assert.equal(far.scrollIntoViewCalls.length, 1)
  assert.notEqual(far.scrollIntoViewCalls[0].behavior, 'smooth', 'the jump is not a smooth scroll')
  assert.equal(far.top, PADDING, 'it is where scroll-padding-top wants it')
  assert.equal(observers.length, 1, 'and a resize observer holds it there')
  assert.equal(scrollBehavior, 'smooth', 'the page scroll-behavior is put back after the jump')
})

test('lite motion always jumps and holds, near or far (the page grows under an instant jump too)', () => {
  motion = 'lite'
  const near = element('chaos-lab', 900)
  goToId('chaos-lab')
  assert.notEqual(near.scrollIntoViewCalls[0].behavior, 'smooth')
  assert.equal(observers.length, 1)
})

test('the hold puts the target back whenever the page grows above it, and lets go when the visitor takes over', () => {
  const target = element('contact', 5000)
  goToId('contact')
  nextTask()
  // A demo above loads and the page grows by 700 px: the target is pushed down; the observer reports it.
  target.top += 700
  observers[0].fire()
  assert.equal(target.top, PADDING, 'put back in the same step')
  // A resize that does not move the target changes nothing.
  const before = scrollY
  observers[0].fire()
  assert.equal(scrollY, before)
  // The visitor scrolls: the hold is over, and the page may grow without anything moving it.
  dispatch('wheel')
  assert.equal(observers[0].disconnected, true)
  assert.equal(count('wheel') + count('touchstart') + count('keydown') + count('pointerdown') + count('hashchange'), 0, 'its listeners are gone')
  target.top += 700
  observers[0].fire()
  assert.equal(target.top, PADDING + 700)
})

test('the key press that started a jump does not end it (the visitor listeners are armed on the next task)', () => {
  element('contact', 5000)
  goToId('contact')
  assert.equal(count('keydown'), 0, 'not armed yet: the very keydown that called goToId is still being dispatched')
  nextTask()
  assert.equal(count('keydown'), 1)
})

test('one landing at a time: a second goToId ends the first (Back during a landing used to finish on the old target)', () => {
  const first = element('service-vision', 5000)
  const second = element('service-policy', 5200)
  goToId('service-vision')
  nextTask()
  assert.equal(observers.length, 1)
  goToId('service-policy')
  assert.equal(observers[0].disconnected, true, 'the first hold is released')
  assert.equal(observers.length, 2)
  // Only the second target is kept in place now: the page grows above both, the released hold does nothing, the live one corrects.
  const before = scrollY
  first.top += 900
  second.top += 900
  observers[0].fire()
  assert.equal(scrollY, before, 'the first hold, released, does not scroll')
  observers[1].fire()
  assert.equal(second.top, PADDING, 'the second is put back')
  assert.notEqual(scrollY, before)
})

test('a change of the address (Back, Forward, an edited fragment) ends a landing in progress', () => {
  const near = element('service-vision', 1500)
  goToId('service-vision')
  nextTask()
  assert.equal(count('hashchange'), 1)
  dispatch('hashchange')
  assert.equal(count('hashchange'), 0)
  assert.equal(count('wheel'), 0)
  assert.equal(near.scrollIntoViewCalls.length, 1, 'and it does not scroll again afterwards')
})

test('a smooth landing is corrected after it rests short of the target, until the target is in place', () => {
  const target = element('service-review', 1500)
  goToId('service-review')
  nextTask()
  // The scroll "ends" 600 px short (a demo loaded on the way and pushed the target down).
  target.top = PADDING + 600
  mock.timers.tick(100) // first look: the position is not known to be still yet
  mock.timers.tick(100)
  mock.timers.tick(100)
  assert.equal(target.scrollIntoViewCalls.length >= 2, true, 'it scrolls to the target again')
  assert.equal(target.scrollIntoViewCalls.at(-1)?.behavior, 'smooth')
})

test('a missing id changes nothing', () => {
  assert.equal(goToId('nope'), false)
  assert.equal(observers.length, 0)
})

test('holdOnTarget gives up after its deadline instead of fighting a page that is still changing', () => {
  const target = element('contact', 5000)
  const originalNow = performance.now.bind(performance)
  const now = mock.method(performance, 'now', () => 1000)
  const release = holdOnTarget(target as unknown as HTMLElement, 2000)
  assert.equal(observers[0].disconnected, false)
  now.mock.mockImplementation(() => 3000)
  target.top += 500
  observers[0].fire()
  assert.equal(observers[0].disconnected, true, 'the first resize after the deadline lets go without moving anything')
  assert.equal(target.top, PADDING + 500)
  release()
  now.mock.restore()
  assert.ok(originalNow() >= 0)
})
