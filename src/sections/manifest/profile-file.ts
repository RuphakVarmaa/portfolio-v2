/**
 * Reading `/profile.json` from the site's own origin (spec 3.6, 4.8): the Manifest renders its skill
 * lines from the file it just fetched, shows the file's own text for "View as agent", and reports what it
 * actually measured (status, bytes, milliseconds). If the file is missing, is not JSON (a dev server answers
 * every unknown path with the app's HTML) or has the wrong shape, `fetchProfile` returns null and the
 * Manifest falls back to the same facts compiled into the page.
 *
 * Pure apart from `fetch` and the clock, both injectable, so the tests run it with fakes.
 */

import { PROFILE_PATH } from './urls.ts'

export interface SkillGroup {
  label: string
  items: string[]
}

export interface ProfileFile {
  /** The response body, exactly as served. */
  text: string
  /** The `skillGroups` array from the parsed file. */
  skillGroups: SkillGroup[]
  /** UTF-8 length of `text`. */
  bytes: number
  /** Wall time from request to the end of the body, in milliseconds (the clock below). */
  ms: number
  /** HTTP status (always 200 here: anything else yields null). */
  status: number
}

export interface FetchDeps {
  fetch?: (url: string, init?: { cache?: 'no-cache' | 'default'; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>
  now?: () => number
  signal?: AbortSignal
}


const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

/** Pull `skillGroups` out of a parsed profile, or null when it is not shaped like one. */
export function readSkillGroups(parsed: unknown): SkillGroup[] | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const groups = (parsed as { skillGroups?: unknown }).skillGroups
  if (!Array.isArray(groups) || groups.length === 0) return null
  const out: SkillGroup[] = []
  for (const group of groups) {
    if (typeof group !== 'object' || group === null) return null
    const { label, items } = group as { label?: unknown; items?: unknown }
    if (typeof label !== 'string' || !isStringArray(items)) return null
    out.push({ label, items })
  }
  return out
}

/** `Languages — Java, Python, C++.` The same sentence shape as `skillLines()` in copy.ts (a test pins them together). */
export function skillLinesFrom(groups: readonly SkillGroup[]): string[] {
  return groups.map((group) => `${group.label} — ${group.items.join(', ')}.`)
}

export const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length

/** Fetch and validate `/profile.json`. Null on any failure (network, status, not JSON, wrong shape). */
export async function fetchProfile(deps: FetchDeps = {}): Promise<ProfileFile | null> {
  const doFetch = deps.fetch ?? ((url, init) => fetch(url, init))
  const now = deps.now ?? (() => performance.now())
  try {
    const started = now()
    const response = await doFetch(PROFILE_PATH, { cache: 'no-cache', signal: deps.signal })
    if (!response.ok) return null
    const text = await response.text()
    const ms = now() - started
    const skillGroups = readSkillGroups(JSON.parse(text))
    if (skillGroups === null) return null
    return { text, skillGroups, bytes: utf8Bytes(text), ms, status: response.status }
  } catch {
    return null
  }
}
