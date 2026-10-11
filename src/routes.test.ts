import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projects } from './data/portfolio.ts'
import { ROUTES, canonicalUrl, matchRoute, normalizePath, routeKey, routeMeta } from './routes.ts'

test('matchRoute resolves every route, tolerating a missing slash, case, query, hash and index.html', () => {
  assert.deepEqual(matchRoute('/'), { kind: 'home' })
  assert.deepEqual(matchRoute(''), { kind: 'home' })
  assert.deepEqual(matchRoute('/index.html'), { kind: 'home' })
  assert.deepEqual(matchRoute('/resume'), { kind: 'resume' })
  assert.deepEqual(matchRoute('/RESUME/'), { kind: 'resume' })
  assert.deepEqual(matchRoute('/experiments/?x=1#y'), { kind: 'experiments' })
  assert.deepEqual(matchRoute('/projects/retrieval/'), { kind: 'project', id: 'retrieval' })
  assert.deepEqual(matchRoute('/projects/policy'), { kind: 'project', id: 'policy' })
  assert.deepEqual(matchRoute('/projects/policy/index.html'), { kind: 'project', id: 'policy' })
  for (const bad of ['/projects/', '/projects/unknown/', '/nope/', '/resume/extra/', '/projects/policy/x/']) {
    assert.deepEqual(matchRoute(bad), { kind: 'notfound' }, bad)
  }
})

test('every prerendered route has a unique key and file, a real title, and a description that fits a search result', () => {
  assert.equal(new Set(ROUTES.map((r) => r.key)).size, ROUTES.length)
  assert.equal(new Set(ROUTES.map((r) => r.file)).size, ROUTES.length)
  for (const route of ROUTES) {
    assert.equal(routeKey(route.match), route.key)
    assert.equal(routeMeta(route.match), route)
    assert.deepEqual(matchRoute(route.path), route.match)
    assert.ok(route.path.startsWith('/') && route.path.endsWith('/'))
    assert.equal(route.file, route.path === '/' ? 'index.html' : `${route.path.slice(1)}index.html`)
    assert.ok(route.title.length > 10 && route.title.length <= 70, `${route.key} title is ${route.title.length} chars`)
    assert.ok(route.description.length >= 100 && route.description.length <= 160, `${route.key} description is ${route.description.length} chars`)
    assert.deepEqual(route.og, { title: route.title, description: route.description, image: 'https://www.ruphak.me/og.png' })
  }
})

test('titles follow the spec table exactly for the routes the spec spells out', () => {
  const titles = Object.fromEntries(ROUTES.map((r) => [r.path, r.title]))
  assert.equal(titles['/'], 'Ruphak Varmaa S — backend and AI systems; this site is one')
  assert.equal(titles['/projects/retrieval/'], 'Agentic RAG Document Intelligence — Ruphak Varmaa S')
  assert.equal(titles['/projects/vision/'], 'Real-Time Vision Analytics — Ruphak Varmaa S')
  assert.equal(titles['/projects/policy/'], 'Multi-Tenant RBAC Platform — Ruphak Varmaa S')
  assert.equal(titles['/projects/review/'], 'Automated Code Review Pipeline — Ruphak Varmaa S')
  assert.equal(titles['/resume/'], 'Résumé — Ruphak Varmaa S')
  assert.equal(titles['/experiments/'], 'Experiments — ruphak.me')
})

test('project routes agree with the data file, and descriptions quote the real metrics', () => {
  for (const project of projects) {
    assert.equal(matchRoute(project.route).kind, 'project')
    const route = ROUTES.find((r) => r.path === project.route)
    assert.ok(route, project.route)
    for (const metric of project.metrics) assert.ok(route.description.includes(`${metric.value} ${metric.label}`), `${project.title}: ${metric.value}`)
  }
})

test('canonical URLs and path normalisation', () => {
  assert.equal(canonicalUrl('/'), 'https://www.ruphak.me')
  assert.equal(canonicalUrl('/resume/'), 'https://www.ruphak.me/resume/')
  assert.equal(normalizePath('/A/B'), '/a/b/')
})
