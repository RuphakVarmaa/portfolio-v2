/**
 * A citation that has to cross a page load.
 *
 * On `/projects/retrieval/` only the retrieval panel exists, so a hit from another section cannot be scrolled
 * to in place: "Find it on this page" has to open the home page at that section. The underline would be lost
 * in the navigation, so the sentence waits in `sessionStorage` for a few seconds and the home page's retrieval
 * panel applies it as soon as it has hydrated.
 *
 * What is stored is a sentence the corpus already holds (public text) plus an anchor and the depth to show; it
 * lives in this tab only, and a stale or malformed entry is ignored. Every storage access is wrapped: private
 * windows and blocked storage simply mean the page opens at the section without the underline.
 *
 * Pure and DOM-free (storage is injected), so the tests run it under Node.
 */
import type { Depth } from '../../../data/copy.ts'

export const PENDING_KEY = 'ruphak-cite'
/** How long a waiting citation stays valid, ms: a navigation takes well under this. */
export const PENDING_TTL_MS = 30_000
const MAX_SENTENCE = 600

export interface PendingCitation {
  anchor: string
  sentence: string
  /** The depth the sentence belongs to (the page shows it before looking for the sentence). */
  depth?: Depth
  /** True when the sentence is a plain-language caption: switch the captions on. */
  plain?: boolean
  /** `Date.now()` when saved. */
  at: number
}

/** The slice of `Storage` this file uses. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function sessionStore(): StorageLike | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

const isDepth = (value: unknown): value is Depth => value === '30s' || value === 'engineer' || value === 'peer'

/** Remember a citation for the next page. False when storage is unavailable (the navigation still happens). */
export function savePending(citation: PendingCitation, storage: StorageLike | null = sessionStore()): boolean {
  if (!storage) return false
  try {
    storage.setItem(PENDING_KEY, JSON.stringify({ ...citation, sentence: citation.sentence.slice(0, MAX_SENTENCE) }))
    return true
  } catch {
    return false
  }
}

/** True when something is waiting (cheap: no parsing). */
export function hasPending(storage: StorageLike | null = sessionStore()): boolean {
  try {
    return storage?.getItem(PENDING_KEY) != null
  } catch {
    return false
  }
}

/** Read and remove the waiting citation. Null when there is none, it is stale, or it is not what `savePending` wrote. */
export function takePending(now: number, storage: StorageLike | null = sessionStore()): PendingCitation | null {
  if (!storage) return null
  let raw: string | null
  try {
    raw = storage.getItem(PENDING_KEY)
    storage.removeItem(PENDING_KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const entry = value as Record<string, unknown>
  const { anchor, sentence, at } = entry
  if (typeof anchor !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(anchor)) return null
  if (typeof sentence !== 'string' || sentence.trim() === '' || sentence.length > MAX_SENTENCE) return null
  if (typeof at !== 'number' || !Number.isFinite(at) || now - at > PENDING_TTL_MS || at - now > PENDING_TTL_MS) return null
  const out: PendingCitation = { anchor, sentence, at }
  if (isDepth(entry.depth)) out.depth = entry.depth
  if (entry.plain === true) out.plain = true
  return out
}
