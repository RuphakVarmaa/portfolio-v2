import type { Ring } from './ring.ts'

/**
 * The single consumer at the far end of the ring (spec 4.4): it takes ONE item at a time, waits for it to
 * be fully processed, and only then takes the next. That is what makes the buffer matter: while the
 * consumer is busy with a slow item, the producers keep pushing and the ring starts dropping its oldest.
 *
 * The loop has no timer and no pending promise while the ring is empty: it stops, and `wake()` (called by
 * the producer after each push) starts it again. An idle pipeline costs nothing.
 *
 * Pure TypeScript with injected `sleep`, so the tests need no real time.
 */

export interface ConsumerOptions<T> {
  ring: Ring<T>
  /** Process one item. The next item is not taken until this settles. A rejection is reported, never thrown. */
  process: (item: T) => Promise<void>
  /**
   * Extra wait after each item, in milliseconds, read before every wait. This is the "slow the consumer
   * down on purpose" control: it makes a healthy pipeline look overloaded so backpressure can be watched.
   */
  delayMs?: () => number
  sleep?: (ms: number) => Promise<void>
  /** A `process` call rejected. The consumer carries on with the next item. */
  onError?: (error: unknown, item: T) => void
  /** An item finished (successfully or not) and the consumer is about to look at the ring again. */
  onSettled?: () => void
}

export interface Consumer {
  /** Start draining if it is not already. Call after every push. Safe to call at any time. */
  wake(): void
  /** Stop for good: the current item finishes, nothing else is taken. Items left in the ring are the caller's. */
  stop(): void
  /** An item is being processed right now. */
  readonly busy: boolean
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createConsumer<T>(options: ConsumerOptions<T>): Consumer {
  const { ring, process, delayMs, sleep = realSleep, onError, onSettled } = options
  let running = false
  let stopped = false
  let busy = false

  const loop = async () => {
    while (!stopped) {
      const item = ring.shift()
      if (item === undefined) break
      busy = true
      try {
        await process(item)
      } catch (error) {
        onError?.(error, item)
      } finally {
        busy = false
      }
      onSettled?.()
      const wait = delayMs?.() ?? 0
      if (wait > 0 && !stopped) await sleep(wait)
    }
    // No await between the empty check above and this line, so a push that arrives later sees running = false.
    running = false
  }

  return {
    wake() {
      if (running || stopped) return
      running = true
      void loop()
    },
    stop() {
      stopped = true
    },
    get busy() {
      return busy
    },
  }
}
