import type { ServiceId } from './cluster/protocol.ts'
import { profile, projects } from './data/portfolio.ts'

/**
 * Routes (spec 3.0). There is no client-side router: every route is a prerendered file and links are
 * plain `<a href>`. `matchRoute` only decides which tree to render for the current pathname.
 */

export type RouteMatch =
  | { kind: 'home' }
  | { kind: 'project'; id: ServiceId }
  | { kind: 'resume' }
  | { kind: 'experiments' }
  | { kind: 'notfound' }

export const SITE_URL = 'https://www.ruphak.me'
export const OG_IMAGE_URL = `${SITE_URL}/og.png`
export const SITE_NAME = profile.name

export interface RouteMeta {
  /** Stable key: 'home', 'project:retrieval', 'resume', 'experiments'. Written to `data-route` by the prerender. */
  key: string
  match: RouteMatch
  /** Pathname with leading and trailing slash, e.g. '/projects/retrieval/'. */
  path: string
  /** Output file inside dist/, e.g. 'projects/retrieval/index.html'. */
  file: string
  title: string
  description: string
  /** Open Graph / Twitter card data: same title and description, the shared 1200x630 image. */
  og: { title: string; description: string; image: string }
  /** sitemap priority */
  priority: number
}

const projectOf = (id: ServiceId) => {
  const project = projects.find((p) => p.serviceId === id)
  if (!project) throw new Error(`No project for service "${id}" in src/data/portfolio.ts`)
  return project
}

/** What each project's in-browser port lets a visitor do, appended to its meta description. */
const PROJECT_TAILS: Record<ServiceId, string> = {
  retrieval: 'Live in-browser port with cited answers.',
  vision: 'Runs here as an in-browser port with a bounded frame queue.',
  policy: 'Try the 10,000-evaluation fuzz in your browser.',
  review: 'Paste code, read five-tier findings.',
}

/** Title and description are built from the data file so a metric can never drift from the résumé. */
const projectTitle = (id: ServiceId) => projectOf(id).title
const projectDescription = (id: ServiceId) => {
  const project = projectOf(id)
  const metrics = project.metrics.map((m) => `${m.value} ${m.label}`).join(', ')
  return `${project.title} by ${profile.name}: ${metrics}. ${PROJECT_TAILS[id]}`
}

/** Build a route entry; `og` is derived so the card can never disagree with the page. */
const route = (entry: Omit<RouteMeta, 'og'>): RouteMeta => ({
  ...entry,
  og: { title: entry.title, description: entry.description, image: OG_IMAGE_URL },
})

const projectRoute = (id: ServiceId, priority: number): RouteMeta =>
  route({
    key: `project:${id}`,
    match: { kind: 'project', id },
    path: `/projects/${id}/`,
    file: `projects/${id}/index.html`,
    title: `${projectTitle(id)} — ${SITE_NAME}`,
    description: projectDescription(id),
    priority,
  })

/** Every prerendered route. The 404 page is a copy of the home page and is not listed here. */
export const ROUTES: readonly RouteMeta[] = [
  route({
    key: 'home',
    match: { kind: 'home' },
    path: '/',
    file: 'index.html',
    title: `${SITE_NAME} — backend and AI systems; this site is one`,
    description:
      'Backend and AI systems by Ruphak Varmaa S. This site is one: workers are the nodes, open tabs form a quorum, and four projects run live in your browser.',
    priority: 1.0,
  }),
  projectRoute('retrieval', 0.8),
  projectRoute('vision', 0.8),
  projectRoute('policy', 0.8),
  projectRoute('review', 0.8),
  route({
    key: 'resume',
    match: { kind: 'resume' },
    path: '/resume/',
    file: 'resume/index.html',
    title: `Résumé — ${SITE_NAME}`,
    description:
      'Résumé of Ruphak Varmaa S: backend and AI systems, projects, experience, education, certifications and skills. Printable HTML, with a PDF download.',
    priority: 0.9,
  }),
  route({
    key: 'experiments',
    match: { kind: 'experiments' },
    path: '/experiments/',
    file: 'experiments/index.html',
    title: 'Experiments — ruphak.me',
    description:
      'Small live pieces from ruphak.me: the scheduler trace viewer, the quorum peer table, the BM25 index explorer and the meter test bench.',
    priority: 0.5,
  }),
]

const SERVICE_IDS_IN_ROUTES: readonly ServiceId[] = ['retrieval', 'vision', 'policy', 'review']

/** Normalise a pathname to lower case with exactly one trailing slash ('' and '/index.html' are home). */
export function normalizePath(pathname: string): string {
  let path = pathname.split(/[?#]/)[0].toLowerCase()
  if (path.endsWith('/index.html')) path = path.slice(0, -'index.html'.length)
  if (!path.startsWith('/')) path = `/${path}`
  return path.endsWith('/') ? path : `${path}/`
}

export function matchRoute(pathname: string): RouteMatch {
  const path = normalizePath(pathname)
  if (path === '/') return { kind: 'home' }
  if (path === '/resume/') return { kind: 'resume' }
  if (path === '/experiments/') return { kind: 'experiments' }
  const project = /^\/projects\/([a-z]+)\/$/.exec(path)
  if (project && (SERVICE_IDS_IN_ROUTES as readonly string[]).includes(project[1])) {
    return { kind: 'project', id: project[1] as ServiceId }
  }
  return { kind: 'notfound' }
}

/** Stable string key for a match; the prerender writes it to `#root[data-route]` so the client knows whether it can hydrate. */
export function routeKey(match: RouteMatch): string {
  return match.kind === 'project' ? `project:${match.id}` : match.kind
}

export function routeMeta(match: RouteMatch): RouteMeta | undefined {
  const key = routeKey(match)
  return ROUTES.find((route) => route.key === key)
}

export function canonicalUrl(path: string): string {
  return path === '/' ? SITE_URL : `${SITE_URL}${path}`
}

/** Section ids on the home page (also hash targets). */
export const SECTION_IDS = {
  controlRoom: 'control-room',
  services: 'services',
  chaosLab: 'chaos-lab',
  deployHistory: 'deploy-history',
  manifest: 'manifest',
  contact: 'contact',
  colophon: 'colophon',
} as const

/** `service-retrieval` etc.: the id on each ServicePanel. */
export const serviceAnchor = (id: ServiceId): string => `service-${id}`
