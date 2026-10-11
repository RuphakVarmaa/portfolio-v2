// PLACEHOLDER from F (foundation), complete enough to ship. Owned by S6 after F merges: refine freely.
// The phone number is NEVER written here (owner decision): it is rendered on the page only.
import { experience, highlights, profile, projects, skillGroups } from '../data/portfolio.ts'
import { ROUTES, canonicalUrl } from '../routes.ts'
import type { BuildInfo } from './build-info.ts'

export interface AgentFiles {
  profileJson: string
  llmsTxt: string
  sitemapXml: string
}

export function buildAgentFiles(buildInfo: BuildInfo): AgentFiles {
  // An explicit allow-list, so a field added to `profile` later (like the phone number) can never leak into the agent files.
  const publicProfile = {
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
  const profileJson =
    JSON.stringify({ ...publicProfile, projects, experience, skillGroups, highlights, routes: ROUTES.map((r) => canonicalUrl(r.path)) }, null, 2) + '\n'

  const llmsTxt =
    [
      `# ${profile.name}`,
      `> Backend and AI systems. ${profile.degree}, ${profile.institution}, ${profile.educationPeriod}, CGPA ${profile.cgpa}.`,
      '',
      `Email: ${profile.email}`,
      `LinkedIn: ${profile.linkedin}`,
      `GitHub: ${profile.github}`,
      `Website: ${canonicalUrl('/')}`,
      '',
      '## Projects',
      ...projects.map((p) => `- ${p.title} (${canonicalUrl(p.route)}): ${p.metrics.map((m) => `${m.value} ${m.label}`).join(', ')}. Stack: ${p.stack.join(', ')}.`),
      '',
      '## Experience',
      ...experience.map((e) => `- ${e.role}, ${e.organization}, ${e.period}${e.proof ? ` (${e.proof})` : ''}`),
      '',
      '## Skills',
      ...skillGroups.map((g) => `- ${g.label}: ${g.items.join(', ')}`),
      '',
      '## Certifications and practice',
      ...highlights.map((h) => `- ${h.value}: ${h.label}`),
      '',
    ].join('\n')

  const day = buildInfo.builtAt.slice(0, 10)
  const sitemapXml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    ROUTES.map(
      (r) => `  <url>\n    <loc>${canonicalUrl(r.path)}${r.path === '/' ? '/' : ''}</loc>\n    <lastmod>${day}</lastmod>\n    <priority>${r.priority.toFixed(1)}</priority>\n  </url>\n`,
    ).join('') +
    '</urlset>\n'

  return { profileJson, llmsTxt, sitemapXml }
}
