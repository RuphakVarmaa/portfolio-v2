/**
 * The files an agent (a crawler, an LLM tool, a recruiter's script) reads instead of guessing from the page
 * (spec 6.10, owned by S6): `/profile.json`, `/llms.txt` and `/sitemap.xml`.
 *
 * Every fact comes from `src/data/portfolio.ts` (and the formatting helpers in `copy.ts`, which also read
 * the data), so a metric, a date or a title cannot drift from the résumé.
 *
 * Owner decision: the phone number is shown on the page (Contact) but NEVER written here. Two guards:
 *   1. `profile.json` is built from an explicit allow-list of profile fields, so a field added to `profile`
 *      later cannot leak by accident.
 *   2. Every file is scanned for the phone number before it is returned, with and without its country code and
 *      however it is spaced or punctuated (`leaksPhone`, src/lib/retrieval/phone-guard.ts, the one rule the corpus
 *      build and the prerender share); a hit throws and the build fails (scripts/prerender.mjs checks again,
 *      independently, and also checks `build-info.json` and the JSON-LD).
 *
 * Pure and deterministic: the same `BuildInfo` gives byte-identical output (the only build-dependent value
 * is the sitemap's `lastmod`, taken from `buildInfo.builtAt`). Runs under Node type stripping (tests, the
 * prerender script), so: erasable TypeScript only, explicit `.ts` imports, no DOM.
 */
import { certificationLines, copy, educationLine } from '../data/copy.ts'
import { experience, highlights, profile, projects, skillGroups } from '../data/portfolio.ts'
import { leaksPhone, phoneDigitForms } from '../lib/retrieval/phone-guard.ts'
import { ROUTES, SITE_URL } from '../routes.ts'
import type { BuildInfo } from './build-info.ts'

export interface AgentFiles {
  /** `/profile.json`: the facts as JSON (2-space indent, trailing newline). */
  profileJson: string
  /** `/llms.txt`: the same facts as a short Markdown summary for language models (llmstxt.org layout). */
  llmsTxt: string
  /** `/sitemap.xml`: every prerendered route plus the PDF résumé. */
  sitemapXml: string
}

/** The résumé PDF is a static file in `public/`, not a prerendered route. */
export const RESUME_PDF_PATH = '/Ruphak-Varmaa-Resume.pdf'

/** Absolute URL for a site path. Unlike `canonicalUrl`, the home page keeps its trailing slash (`https://www.ruphak.me/`). */
export const absoluteUrl = (path: string): string => `${SITE_URL}${path}`

/** The profile fields an agent may read. An allow-list on purpose: `phone` and `publishPhone` are not in it. */
export function publicProfile() {
  return {
    name: profile.name,
    shortName: profile.shortName,
    email: profile.email,
    linkedin: profile.linkedin,
    github: profile.github,
    website: profile.website,
    degree: profile.degree,
    institution: profile.institution,
    educationPeriod: profile.educationPeriod,
    cgpa: profile.cgpa,
  }
}

/** Every spelling of the phone number a leak could take: as written, without spaces, digits only, with and without `+`, and the national number. */
export function phoneForms(phone: string = profile.phone): string[] {
  return [...new Set([phone, phone.replaceAll(' ', ''), ...phoneDigitForms(phone), `+${phone.replace(/\D/g, '')}`])].filter((form) => form.length > 0)
}

/**
 * Throws if any generated file contains the phone number, with or without its country code and however it is spaced
 * (`leaksPhone`: its digits in order, with up to four spaces or punctuation marks between neighbours). Exported for the tests.
 */
export function assertNoPhone(files: Record<string, string>, phone: string = profile.phone): void {
  for (const [name, text] of Object.entries(files)) {
    if (leaksPhone(text, phone)) throw new Error(`agent-files: the phone number leaked into ${name}`)
  }
}

const escapeXml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')

const metricLine = (metrics: ReadonlyArray<{ value: string; label: string }>): string =>
  metrics.map((metric) => `${metric.value} ${metric.label}`).join(', ')

// ---- profile.json ----------------------------------------------------------------------------------

function buildProfileJson(): string {
  const body = {
    ...publicProfile(),
    projects,
    experience,
    skillGroups,
    highlights,
    routes: ROUTES.map((route) => absoluteUrl(route.path)),
  }
  return JSON.stringify(body, null, 2) + '\n'
}

// ---- llms.txt --------------------------------------------------------------------------------------

/**
 * Markdown in the llmstxt.org shape: an H1, a blockquote summary, a paragraph of context, then H2 sections of
 * lists. Facts are written once each; every project metric and every experience period appears verbatim.
 */
function buildLlmsTxt(): string {
  const headings = copy.resume.headings
  const lines: string[] = []
  const add = (...next: string[]) => lines.push(...next)

  add(`# ${profile.name}`, '')
  add(`> ${profile.name} builds backend and AI systems. ${copy.controlRoom.identity}`, '')
  // SPEC-GAP: this paragraph is agent-facing prose; move it into `copy.ts` if the owner wants to edit it there.
  add(
    'This website is itself a small cluster running in the visitor’s browser: Web Workers are the nodes and open tabs form a quorum. The four project services on it are in-browser ports of the projects listed below; the metrics listed here are the figures from the résumé for the original systems; the in-browser ports do not re-measure them.',
    `Every fact in this file is identical to the machine-readable profile at ${absoluteUrl('/profile.json')}.`,
    '',
  )

  add('## Contact', '')
  add(`- Email: ${profile.email}`, `- LinkedIn: ${profile.linkedin}`, `- GitHub: ${profile.github}`, `- Website: ${absoluteUrl('/')}`, '')

  add(`## ${headings.projects}`, '')
  for (const project of projects) {
    add(`- [${project.title}](${absoluteUrl(project.route)}): ${metricLine(project.metrics)}. Stack: ${project.stack.join(', ')}. ${project.summary}`)
  }
  add('')

  add(`## ${headings.experience}`, '')
  for (const entry of experience) {
    add(`- ${entry.role}, ${entry.organization}, ${entry.period}${entry.proof ? ` (${entry.proof})` : ''}. ${entry.description}`)
  }
  add('')

  add(`## ${headings.education}`, '', `- ${educationLine()}`, '')

  add(`## ${headings.skills}`, '')
  for (const group of skillGroups) add(`- ${group.label}: ${group.items.join(', ')}`)
  add('')

  add(`## ${headings.certifications}`, '')
  for (const line of certificationLines()) add(`- ${line}`)
  add('')

  add('## Optional', '')
  add(
    `- [Résumé (HTML)](${absoluteUrl('/resume/')}): the same facts as a printable page`,
    `- [Résumé (PDF)](${absoluteUrl(RESUME_PDF_PATH)})`,
    `- [Machine-readable profile](${absoluteUrl('/profile.json')}): JSON`,
    `- [Experiments](${absoluteUrl('/experiments/')}): small live pieces of the cluster that runs this site`,
    `- [Sitemap](${absoluteUrl('/sitemap.xml')})`,
    '',
  )

  return lines.join('\n')
}

// ---- sitemap.xml -----------------------------------------------------------------------------------

function buildSitemapXml(buildInfo: BuildInfo): string {
  // `builtAt` is an ISO timestamp; the sitemap wants the date. A malformed value is left out rather than guessed.
  const day = /^\d{4}-\d{2}-\d{2}/.exec(buildInfo.builtAt)?.[0]
  const lastmod = day ? `    <lastmod>${day}</lastmod>\n` : ''
  const entry = (loc: string, priority: number, withDate: boolean) =>
    `  <url>\n    <loc>${escapeXml(loc)}</loc>\n${withDate ? lastmod : ''}    <priority>${priority.toFixed(1)}</priority>\n  </url>\n`
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    ROUTES.map((route) => entry(absoluteUrl(route.path), route.priority, true)).join('') +
    // A static file: its modification date is unknown to the build, so it carries no `lastmod`.
    entry(absoluteUrl(RESUME_PDF_PATH), 0.6, false) +
    '</urlset>\n'
  )
}

// ---- entry -----------------------------------------------------------------------------------------

export function buildAgentFiles(buildInfo: BuildInfo): AgentFiles {
  const files: AgentFiles = {
    profileJson: buildProfileJson(),
    llmsTxt: buildLlmsTxt(),
    sitemapXml: buildSitemapXml(buildInfo),
  }
  assertNoPhone({ 'profile.json': files.profileJson, 'llms.txt': files.llmsTxt, 'sitemap.xml': files.sitemapXml })
  return files
}
