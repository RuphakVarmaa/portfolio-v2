/**
 * A bounded ring buffer with drop-oldest backpressure (spec 4.4): the queue between capture and
 * inference in the Vision service.
 *
 * Why this shape: when the producer is faster than the consumer, an unbounded queue turns every frame
 * into stale news (latency grows without limit). A bounded buffer that evicts its OLDEST entry keeps the
 * consumer working on the freshest data and keeps latency bounded by `capacity x service time`. That is
 * the design behind the production pipeline's 40% latency-variance reduction; here it is the real thing,
 * not a drawing of it.
 *
 * Pure TypeScript, no DOM, so it runs under `node --test` (ring.test.ts) and in the browser.
 */

export interface RingOptions<T> {
  /**
   * Called synchronously with each item evicted by `push` when the buffer is full, oldest first. This is
   * where a dropped video frame releases its memory (`ImageBitmap.close()`).
   */
  onDrop?: (item: T) => void
}

export interface Ring<T> {
  /** Most items the buffer holds at once. */
  readonly capacity: number
  /** Items waiting right now. Never exceeds `capacity`. */
  readonly depth: number
  /** Items evicted by `push` since the ring was created. Items removed by `shift` or `drain` are not drops. */
  readonly dropped: number
  /** Items ever accepted by `push` (evicted ones included). */
  readonly pushed: number
  /** Add an item. If the buffer is full the OLDEST item is evicted, passed to `onDrop` and returned. */
  push(item: T): T | undefined
  /** Remove and return the oldest item, or `undefined` when empty. */
  shift(): T | undefined
  /** The oldest item without removing it. */
  peek(): T | undefined
  /** Remove everything and return it, oldest first. These are not counted as drops (the caller owns them now). */
  drain(): T[]
  /** A copy of the contents, oldest first. For display and tests. */
  toArray(): T[]
}

export function createRing<T>(capacity: number, options: RingOptions<T> = {}): Ring<T> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`A ring needs an integer capacity of at least 1 (got ${String(capacity)})`)
  }
  const { onDrop } = options
  const slots: Array<T | undefined> = new Array<T | undefined>(capacity).fill(undefined)
  /** Index of the oldest item. */
  let head = 0
  let length = 0
  let dropped = 0
  let pushed = 0

  const at = (offset: number) => (head + offset) % capacity

  return {
    capacity,
    get depth() {
      return length
    },
    get dropped() {
      return dropped
    },
    get pushed() {
      return pushed
    },
    push(item) {
      // `undefined` is how `shift` and `peek` say "empty", so it cannot be stored.
      if (item === undefined) throw new TypeError('A ring cannot hold undefined')
      pushed += 1
      let evicted: T | undefined
      if (length === capacity) {
        // Full: overwrite the oldest slot and advance the head, so the new item becomes the newest.
        evicted = slots[head]
        slots[head] = item
        head = at(1)
        dropped += 1
        if (onDrop && evicted !== undefined) onDrop(evicted)
      } else {
        slots[at(length)] = item
        length += 1
      }
      return evicted
    },
    shift() {
      if (length === 0) return undefined
      const item = slots[head]
      slots[head] = undefined
      head = at(1)
      length -= 1
      return item
    },
    peek() {
      return length === 0 ? undefined : slots[head]
    },
    drain() {
      const items: T[] = []
      while (length > 0) {
        const item = slots[head]
        slots[head] = undefined
        head = at(1)
        length -= 1
        if (item !== undefined) items.push(item)
      }
      return items
    },
    toArray() {
      const items: T[] = []
      for (let i = 0; i < length; i++) {
        const item = slots[at(i)]
        if (item !== undefined) items.push(item)
      }
      return items
    },
  }
}
