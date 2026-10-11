import assert from 'node:assert/strict'
import { test } from 'node:test'
import { certificationLines, educationLine } from '../data/copy.ts'
import { experience, highlights, profile, projects, skillGroups } from '../data/portfolio.ts'
import { ROUTES, SITE_URL } from '../routes.ts'
import { AGENT_URLS } from '../sections/manifest/urls.ts'
import { RESUME_PDF_PATH, absoluteUrl, assertNoPhone, buildAgentFiles, phoneForms, publicProfile } from './agent-files.ts'
import { emptyBuildInfo, type BuildInfo } from './build-info.ts'

const build = (builtAt = '2026-10-11T17:42:00.000Z'): BuildInfo => ({ ...emptyBuildInfo(), builtAt })
const files = buildAgentFiles(build())

/** Every way the phone number could be spelled, derived from the data (never typed here). */
const digits = profile.phone.replace(/\D/g, '')
const PHONE_SPELLINGS = [profile.phone, profile.phone.replaceAll(' ', ''), digits, `+${digits}`, digits.slice(-10)]

// ---- the owner's decision: visible on the page, absent from every agent file -----------------------

test('the phone number is in none of the three agent files, in any spelling', () => {
  for (const [name, text] of Object.entries(files)) {
    for (const spelling of PHONE_SPELLINGS) assert.ok(!text.includes(spelling), `${name} contains ${spelling.length}-char phone spelling`)
  }
})

test('the phone flag itself is not published either', () => {
  assert.ok(!files.profileJson.includes('publishPhone'))
  assert.ok(!files.profileJson.includes('"phone"'))
  assert.ok(!('phone' in publicProfile()) && !('publishPhone' in publicProfile()))
})

test('the guard throws if a phone number ever reaches an output', () => {
  assert.throws(() => assertNoPhone({ 'llms.txt': `Call ${profile.phone}` }), /phone number leaked into llms\.txt/)
  assert.throws(() => assertNoPhone({ 'profile.json': `"x": "${digits}"` }), /leaked into profile\.json/)
  assert.doesNotThrow(() => assertNoPhone({ 'llms.txt': 'no number here' }))
  assert.ok(phoneForms().length >= 3)
})

// ---- profile.json ----------------------------------------------------------------------------------

test('profile.json parses, ends with a newline, and carries exactly the spec fields', () => {
  assert.ok(files.profileJson.endsWith('}\n'))
  const json = JSON.parse(files.profileJson) as Record<string, unknown>
  assert.deepEqual(Object.keys(json), [
    'name', 'shortName', 'email', 'linkedin', 'github', 'website', 'degree', 'institution', 'educationPeriod', 'cgpa',
    'projects', 'experience', 'skillGroups', 'highlights', 'routes',
  ])
})

test('profile.json facts equal portfolio.ts exactly (projects with every field, experience, skills, highlights)', () => {
  const json = JSON.parse(files.profileJson)
  assert.deepEqual(json.projects, projects)
  assert.deepEqual(json.experience, experience)
  assert.deepEqual(json.skillGroups, skillGroups)
  assert.deepEqual(json.highlights, highlights)
  for (const key of Object.keys(publicProfile()) as Array<keyof ReturnType<typeof publicProfile>>) assert.equal(json[key], profile[key], key)
  // "all fields": every key a project has in the data is in the file, for every project.
  for (const [index, project] of projects.entries()) assert.deepEqual(Object.keys(json.projects[index]), Object.keys(project))
})

test('profile.json lists every prerendered route as an absolute URL', () => {
  const json = JSON.parse(files.profileJson)
  assert.deepEqual(json.routes, ROUTES.map((route) => `${SITE_URL}${route.path}`))
  for (const url of json.routes as string[]) assert.match(url, /^https:\/\/www\.ruphak\.me\/(?:[a-z-]+\/)*$/)
})

// ---- llms.txt --------------------------------------------------------------------------------------

test('llms.txt has the llmstxt.org shape: one H1, one blockquote summary, H2 sections, a trailing newline', () => {
  const lines = files.llmsTxt.split('\n')
  assert.equal(lines[0], `# ${profile.name}`)
  assert.equal(lines.filter((line) => line.startsWith('# ')).length, 1)
  assert.equal(lines[2].startsWith('> '), true)
  assert.ok(files.llmsTxt.endsWith('\n'))
  const sections = lines.filter((line) => line.startsWith('## '))
  assert.deepEqual(sections, ['## Contact', '## Projects', '## Experience', '## Education', '## Skills', '## Certifications and practice', '## Optional'])
  assert.ok(!files.llmsTxt.includes('\n\n\n'), 'no runs of blank lines')
})

test('every project metric string and every experience period appears verbatim in llms.txt', () => {
  for (const project of projects) {
    assert.ok(files.llmsTxt.includes(project.title), project.title)
    for (const metric of project.metrics) assert.ok(files.llmsTxt.includes(`${metric.value} ${metric.label}`), `${project.title}: ${metric.value} ${metric.label}`)
    for (const item of project.stack) assert.ok(files.llmsTxt.includes(item), `${project.title}: ${item}`)
    assert.ok(files.llmsTxt.includes(absoluteUrl(project.route)), project.route)
  }
  for (const entry of experience) {
    assert.ok(files.llmsTxt.includes(entry.period), entry.period)
    assert.ok(files.llmsTxt.includes(entry.role), entry.role)
    assert.ok(files.llmsTxt.includes(entry.organization), entry.organization)
    if (entry.proof) assert.ok(files.llmsTxt.includes(entry.proof), entry.proof)
  }
})

test('llms.txt carries the contact facts, the education line, every skill and every certification line once', () => {
  for (const value of [profile.email, profile.linkedin, profile.github, profile.cgpa, profile.educationPeriod]) assert.ok(files.llmsTxt.includes(value), value)
  assert.ok(files.llmsTxt.includes(educationLine()))
  for (const group of skillGroups) for (const item of group.items) assert.ok(files.llmsTxt.includes(item), item)
  for (const line of certificationLines()) {
    assert.equal(files.llmsTxt.split(line).length - 1, 1, `${line} appears exactly once`)
  }
  assert.ok(files.llmsTxt.includes(highlights[0].value))
})

test('every link in llms.txt is an absolute https URL on the site', () => {
  const links = [...files.llmsTxt.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1])
  assert.ok(links.length >= projects.length + 4)
  for (const link of links) assert.ok(link.startsWith(`${SITE_URL}/`), link)
})

// ---- sitemap.xml -----------------------------------------------------------------------------------

test('sitemap.xml lists every route and the PDF, with the build date as lastmod on pages', () => {
  const xml = files.sitemapXml
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'))
  assert.ok(xml.endsWith('</urlset>\n'))
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
  assert.deepEqual(locs, [...ROUTES.map((route) => absoluteUrl(route.path)), absoluteUrl(RESUME_PDF_PATH)])
  assert.equal(new Set(locs).size, locs.length, 'no duplicate URLs')
  assert.equal([...xml.matchAll(/<lastmod>2026-10-11<\/lastmod>/g)].length, ROUTES.length)
  assert.equal([...xml.matchAll(/<priority>(?:0|1)\.\d<\/priority>/g)].length, ROUTES.length + 1)
  assert.ok(xml.includes('<loc>https://www.ruphak.me/</loc>'))
  assert.ok(xml.includes('<loc>https://www.ruphak.me/experiments/</loc>'))
})

test('a malformed build date leaves lastmod out instead of guessing', () => {
  const xml = buildAgentFiles({ ...build(), builtAt: 'not a date' }).sitemapXml
  assert.ok(!xml.includes('<lastmod>'))
})

// ---- determinism -----------------------------------------------------------------------------------

test('same input, byte-identical output; only the sitemap depends on the build date', () => {
  const again = buildAgentFiles(build())
  assert.deepEqual(again, files)
  const other = buildAgentFiles(build('2027-01-02T00:00:00.000Z'))
  assert.equal(other.profileJson, files.profileJson)
  assert.equal(other.llmsTxt, files.llmsTxt)
  assert.notEqual(other.sitemapXml, files.sitemapXml)
})

// ---- what the Manifest section points at -----------------------------------------------------------

test('the Manifest section copies URLs that this build actually publishes', () => {
  const published = new Set(['/profile.json', '/llms.txt', '/sitemap.xml', ...ROUTES.map((route) => route.path)])
  for (const url of AGENT_URLS) assert.ok(published.has(url.path), url.path)
  assert.deepEqual(AGENT_URLS.map((url) => url.id), ['profile', 'llms', 'resume'])
})
