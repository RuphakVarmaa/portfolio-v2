/*
 * What the Colophon's source link points at, and what it may honestly be called (owner item 6; review finding R4).
 *
 * `copy.colophon.sourceUrl` ships as the owner's GitHub account page until the owner replaces it with the exact
 * repository. An account page is not a repository, and the credits line ("source: <address>") and the
 * "Making-of (repo README)" link both read as if it were: a visitor checking the claim that the cluster is new
 * work would land on a profile, not on code. So, until the address names a repository:
 *
 *   - the credits link says "GitHub profile" (a bare GitHub account page) instead of printing the address, and
 *   - the Making-of link, whose label says "repo README", is left out.
 *
 * Once `sourceUrl` has an owner and a repository (two path segments or more) the sentence prints the address
 * itself and the Making-of link returns, with nothing to change here. Pure (no React, no DOM), so the rules are
 * unit-tested under Node; src/sections/colophon/index.tsx only renders what this returns.
 */
import { copy } from '../../data/copy.ts'

const GITHUB_HOSTS: ReadonlySet<string> = new Set(['github.com', 'www.github.com'])

/** The path of an http(s) address as its non-empty segments, or null when the text is not such an address. */
function pathSegments(address: string): { host: string; segments: string[] } | null {
  try {
    const url = new URL(address)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return { host: url.hostname.toLowerCase(), segments: url.pathname.split('/').filter((segment) => segment !== '') }
  } catch {
    return null
  }
}

/** True for `https://host/owner/repository...`; false for an account page (`https://host/owner`), a bare host, or text that is not an address. */
export function isRepositoryUrl(address: string): boolean {
  const parsed = pathSegments(address)
  return parsed !== null && parsed.segments.length >= 2
}

export interface SourceLink {
  /** The address names a repository. */
  isRepository: boolean
  /** The link's words: the address itself for a repository, "GitHub profile" for a bare GitHub account page, otherwise the address. */
  label: string
}

/** Classifies the source address and picks the label it may carry. Never throws. */
export function describeSource(address: string, profileLabel: string = copy.colophon.profileLabel): SourceLink {
  if (isRepositoryUrl(address)) return { isRepository: true, label: address }
  const parsed = pathSegments(address)
  const isGitHubProfile = parsed !== null && GITHUB_HOSTS.has(parsed.host) && parsed.segments.length === 1
  return { isRepository: false, label: isGitHubProfile ? profileLabel : address }
}

/**
 * Cut a sentence around the words of its link (they come last, so the last match is the one). Returns the text
 * before and after, or null when the words are empty or not in the sentence.
 */
export function splitAtLink(sentence: string, label: string): { before: string; after: string } | null {
  if (label === '') return null
  const at = sentence.lastIndexOf(label)
  if (at < 0) return null
  return { before: sentence.slice(0, at), after: sentence.slice(at + label.length) }
}

export interface ColophonSource extends SourceLink {
  /** Where the source link goes (`copy.colophon.sourceUrl`). */
  href: string
  /** The credits sentence exactly as the Colophon prints it: the label stands where the address used to. */
  sentence: string
  /** The Making-of link's address, or null while the source address is not a repository (the link is then left out). */
  makingOfHref: string | null
}

/** The parts of `copy.colophon` the source link reads (a parameter so that the tests can try other addresses). */
export interface ColophonCopy {
  sourceUrl: string
  profileLabel: string
  credits: (sourceUrl: string) => string
  links: { makingOf: { hrefSuffix: string } }
}

/** Everything the Colophon needs to render its source link, read from `copy.colophon`. */
export function colophonSource(colophon: ColophonCopy = copy.colophon): ColophonSource {
  const { sourceUrl, profileLabel, credits, links } = colophon
  const source = describeSource(sourceUrl, profileLabel)
  return {
    ...source,
    href: sourceUrl,
    sentence: credits(source.label),
    makingOfHref: source.isRepository ? `${sourceUrl}${links.makingOf.hrefSuffix}` : null,
  }
}
