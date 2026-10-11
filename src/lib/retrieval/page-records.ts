/**
 * What "this page's own text" means for retrieval: the prose a visitor reads on the home page, in reading
 * order, one record per element, read from the same two sources the page renders from
 * (`src/data/copy.ts` and `src/data/portfolio.ts`), so the index can never drift from the page.
 *
 * Included: headings, ledes, the three explanation depths of every service, plain-language captions, the
 * honest captions, the labels on the schematics, the work traces, the deploy history, the skills, the
 * contact line, the colophon.
 * Left out on purpose:
 *   - buttons, placeholders, chips and other controls (a search for "What broke in the RBAC project?" must
 *     not "find" the chip that suggests it)
 *   - anything measured at runtime (the boot line, telemetry, the build trace)
 *   - the phone number (it is on the page, but it stays out of every machine-readable file: profile.json,
 *     llms.txt, the JSON-LD, and this corpus, which is a public static file)
 *   - the project `details` bullets: they are on /resume/, not on the home page
 *
 * Reading order inside a service panel follows ServicePanel: title, measured numbers, stack, the explanation
 * (30 s, Engineer, Peer: one is on screen at a time, a citation switches the depth to show the one it
 * cites), the plain caption, the honest caption, the schematic parts, then the work trace.
 *
 * Imports data, so it is for the build script and tests only: the worker never imports this file.
 */
import { copy, certificationLines, educationLine, projectFor, releases, serviceNumber, skillLines, SERVICE_ORDER } from '../../data/copy.ts'
import type { Depth } from '../../data/copy.ts'
import { profile, projects } from '../../data/portfolio.ts'
import type { PageRecord, PartKind, SectionDefinition } from './corpus.ts'

const DEPTH_LABEL: Record<Depth, string> = { '30s': '30-second explanation', engineer: 'Engineer explanation', peer: 'Peer explanation' }

/** The home page's hash targets that carry text, in reading order. Windows never cross from one to the next. */
export const SECTIONS: readonly SectionDefinition[] = [
  { id: 'control-room', anchor: 'control-room', title: 'Control room', context: 'Control room' },
  { id: 'services', anchor: 'services', title: 'Services', context: 'Services' },
  ...SERVICE_ORDER.map((id) => ({
    id: `service-${id}`,
    anchor: `service-${id}`,
    title: `Service ${String(serviceNumber(id)).padStart(2, '0')} · ${projectFor(id).title}`,
    context: projectFor(id).title,
  })),
  { id: 'chaos-lab', anchor: 'chaos-lab', title: 'Chaos lab', context: 'Chaos lab' },
  { id: 'deploy-history', anchor: 'deploy-history', title: 'Deploy history', context: 'Deploy history' },
  { id: 'manifest', anchor: 'manifest', title: 'Manifest', context: 'Manifest' },
  { id: 'contact', anchor: 'contact', title: 'Contact', context: 'Contact' },
  { id: 'colophon', anchor: 'colophon', title: 'Colophon', context: 'Colophon' },
]

type Draft = Omit<PageRecord, 'sectionId' | 'anchor'>

function inSection(sectionId: string, drafts: readonly Draft[]): PageRecord[] {
  return drafts.filter((draft) => draft.text.trim() !== '').map((draft) => ({ sectionId, anchor: sectionId, ...draft }))
}

const text = (label: string, value: string, kind?: PartKind, group?: string): Draft => {
  const draft: Draft = { label, text: value }
  if (kind) draft.kind = kind
  if (group) draft.group = group
  return draft
}

function controlRoom(): PageRecord[] {
  const t = copy.controlRoom
  const index = projects.flatMap((project) => [text('Hero · Service index', project.title), text('Hero · Service index', project.headlineMetric)])
  return inSection('control-room', [
    text('Hero', t.eyebrow),
    text('Hero', t.h1),
    text('Hero', t.lead),
    text('Hero · In plain words', t.plain, 'plain'),
    text('Hero · Who', t.identity),
    text('Hero · Authorship', t.authorship),
    text('Hero · Service index', t.serviceIndex.heading, 'label'),
    ...index,
    text('Hero · Board', t.board.plain, 'plain'),
  ])
}

function servicesIntro(): PageRecord[] {
  return inSection('services', [text('Services', copy.services.title, 'label'), text('Services', copy.services.lead)])
}

function servicePanel(id: (typeof SERVICE_ORDER)[number]): PageRecord[] {
  const t = copy.services[id]
  const project = projectFor(id)
  const number = `Service ${String(serviceNumber(id)).padStart(2, '0')}`
  const labels = copy.services.panel.traceLabels
  const drafts: Draft[] = [
    text(number, project.title),
    ...project.metrics.map((metric) => text(`${number} · Measured on the production system`, `${metric.value} ${metric.label}`)),
    text(`${number} · Stack`, `Stack ${project.stack.join(' · ')}`),
    ...(['30s', 'engineer', 'peer'] as const).map((depth): Draft => ({ label: `${number} · ${DEPTH_LABEL[depth]}`, text: t.depth[depth], depth })),
    text(`${number} · In plain words`, t.plain, 'plain'),
    text(`${number} · About this port`, t.caption),
    ...t.schematic.nodes.map((node) => text(`${number} · Pipeline diagram`, node.label)),
  ]
  for (const key of ['decisions', 'tradeoffs', 'broke', 'change'] as const) {
    const group = `${id}:trace:${key}`
    drafts.push(text(`${number} · Work trace`, labels[key], 'label', group), text(`${number} · Work trace · ${labels[key]}`, t.trace[key], undefined, group))
  }
  return inSection(`service-${id}`, drafts)
}

function chaosLab(): PageRecord[] {
  const t = copy.chaos
  return inSection('chaos-lab', [
    text('Chaos lab', t.title, 'label'),
    text('Chaos lab', t.lead),
    text('Chaos lab · Pull the plug', t.experiments.plug.plain, 'plain'),
    text('Chaos lab · Open me in another tab', t.experiments.tab.plain, 'plain'),
    text('Chaos lab · Close the leader', t.experiments.leader.plain, 'plain'),
  ])
}

function deployHistory(): PageRecord[] {
  const t = copy.deployHistory
  const drafts: Draft[] = [text('Deploy history', t.title, 'label'), text('Deploy history', t.lead), text('Deploy history · In plain words', t.plain, 'plain')]
  for (const release of releases()) {
    const where = `Deploy history · ${release.tag}`
    const group = `release:${release.tag}`
    drafts.push(
      text(where, release.tag, 'label', group),
      text(where, release.role, undefined, group),
      text(where, release.organization, undefined, group),
      text(where, release.period, undefined, group),
      text(where, release.note, undefined, group),
    )
    if (release.proof) drafts.push(text(where, release.proof, undefined, group))
    drafts.push(text(where, release.stackDiff, undefined, group))
  }
  const neuralInverseNote = t.neuralInverseNote
  if (neuralInverseNote) drafts.push(text('Deploy history · v2022.09', neuralInverseNote, undefined, 'release:v2022.09'))
  drafts.push(text('Deploy history · Education', educationLine()))
  for (const line of certificationLines()) drafts.push(text('Deploy history · Certifications and practice', line))
  return inSection('deploy-history', drafts)
}

function manifest(): PageRecord[] {
  const t = copy.manifest
  return inSection('manifest', [
    text('Manifest', t.title, 'label'),
    text('Manifest', t.note),
    text('Manifest · In plain words', t.plain, 'plain'),
    ...skillLines().map((line) => text('Manifest · Skills', line)),
  ])
}

/** `https://linkedin.com/in/ruphakvarmaa` -> `linkedin.com/in/ruphakvarmaa`: the address as the Contact section prints it. */
const bare = (url: string): string => url.replace(/^https?:\/\//, '')

function contact(): PageRecord[] {
  const t = copy.contact
  // Fields are picked one by one: the phone number is on the page but must never reach this public file.
  const { email, linkedin, github } = profile
  return inSection('contact', [
    text('Contact', t.title, 'label'),
    text('Contact', t.line),
    text('Contact · Email', email),
    text('Contact · LinkedIn', t.linkedin),
    text('Contact · LinkedIn', bare(linkedin)),
    text('Contact · GitHub', t.github),
    text('Contact · GitHub', bare(github)),
    text('Contact · Résumé', t.resume.label),
    text('Contact · Résumé', `${t.resume.html} ${t.resume.pdf}`),
  ])
}

function colophon(): PageRecord[] {
  const t = copy.colophon
  return inSection('colophon', [
    text('Colophon', t.title, 'label'),
    text('Colophon', t.version),
    text('Colophon', t.authorship),
    text('Colophon', t.credits(t.sourceUrl)),
    ...t.changelog.map((entry) => text('Colophon · Changelog', t.changelogLine(entry))),
  ])
}

/** Every record of the home page, section by section, in reading order. */
export function pageRecords(): PageRecord[] {
  return [
    ...controlRoom(),
    ...servicesIntro(),
    ...SERVICE_ORDER.flatMap((id) => servicePanel(id)),
    ...chaosLab(),
    ...deployHistory(),
    ...manifest(),
    ...contact(),
    ...colophon(),
  ]
}
