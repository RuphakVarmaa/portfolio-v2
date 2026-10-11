/**
 * Sliding windows over a run of tokens (spec 3.3a and 6.6).
 *
 * The port's encoder (all-MiniLM-L6-v2) works with 256 wordpieces, while the production system cut
 * 512-token windows for pgvector; so this site cuts WINDOW = 256 wordpiece windows that advance by
 * STRIDE = 192, which leaves OVERLAP = 64 wordpieces shared by neighbours. Overlap is the point: it
 * stops a fact from being lost at the edge of a window, which is where the production precision was
 * leaking (see the work trace in the retrieval panel).
 *
 * Two rules the spec adds, both enforced here:
 *   - a window never crosses a section boundary (the caller windows one section at a time)
 *   - a window starts and ends on a word boundary, so its text is a clean substring of the page and no
 *     word is split in half (a window may therefore be a few pieces under 256, never over)
 *
 * The chunker only needs offsets, so it works on any tokenizer: wordpieces (normal case) or whole words
 * (the documented fallback when the vocabulary file is absent).
 *
 * Pure and DOM-free: the build script and the tests import it, and the worker re-exports the numbers.
 */

export const WINDOW = 256
export const STRIDE = 192
export const OVERLAP = WINDOW - STRIDE

/** What the chunker needs to know about one token. */
export interface TokenSpan {
  /** Offset into the section text where the token starts. */
  start: number
  /** Offset where it ends (exclusive). */
  end: number
  /** True when the token begins a word (the only place a window may start or end). */
  first: boolean
}

/** A window as token indexes: tokens `start` up to (not including) `end`. */
export interface TokenWindow {
  start: number
  end: number
}

export interface WindowOptions {
  window?: number
  stride?: number
}

/**
 * Cut `tokens` into windows. A run no longer than the window is a single window; otherwise windows start
 * at 0, stride, 2 * stride, ... (each moved back to the nearest word start) and the last one ends at the
 * final token. Every token is in at least one window.
 */
export function cutWindows(tokens: readonly TokenSpan[], options: WindowOptions = {}): TokenWindow[] {
  const window = options.window ?? WINDOW
  const stride = options.stride ?? STRIDE
  if (window < 1 || stride < 1 || stride > window) throw new RangeError('stride must be between 1 and the window size')
  const n = tokens.length
  if (n === 0) return []

  /** The largest word start at or before `index` (index n counts as a boundary). */
  const boundaryAtOrBefore = (index: number): number => {
    let i = Math.min(index, n)
    while (i > 0 && i < n && !tokens[i].first) i -= 1
    return i
  }

  const windows: TokenWindow[] = []
  for (let nominal = 0; ; nominal += stride) {
    let start = boundaryAtOrBefore(nominal)
    const previous = windows[windows.length - 1]
    // Moving back to a word start must never repeat or reverse a window (only a word longer than the
    // stride can cause it): carry on where the previous window stopped, so every token stays covered.
    if (previous && start <= previous.start) start = previous.end
    const limit = Math.min(start + window, n)
    let end = limit === n ? n : boundaryAtOrBefore(limit)
    // A single word longer than the window: cut it, since there is no word boundary to use.
    if (end <= start) end = limit
    windows.push({ start, end })
    if (end >= n) break
  }
  return windows
}

/** The exact slice of the section text a window covers (from its first token to its last). */
export function windowSlice(text: string, tokens: readonly TokenSpan[], window: TokenWindow): { from: number; to: number; text: string } {
  const from = tokens[window.start].start
  const to = tokens[window.end - 1].end
  return { from, to, text: text.slice(from, to) }
}
