import assert from 'node:assert/strict'
import { test } from 'node:test'
import { certificationLines, copy, DEPTHS, educationLine, projectFor, releases, SERVICE_ORDER, skillLines } from './copy.ts'
import { NODE_COPY } from './node-copy.ts'
import { experience, highlights, profile, projects, skillGroups } from './portfolio.ts'

/** The Service index table from spec 3.2: title and headline metric, verbatim. */
const SERVICE_INDEX = [
  ['Agentic RAG Document Intelligence', '87% retrieval precision'],
  ['Real-Time Vision Analytics', '94% mAP@0.5'],
  ['Multi-Tenant RBAC Platform', '120ms query latency, down from 340ms'],
  ['Automated Code Review Pipeline', '-45% median PR cycle'],
]

test('the four projects carry the service id, headline metric and route from the spec, in the spec order', () => {
  assert.deepEqual(
    projects.map((p) => [p.title, p.headlineMetric]),
    SERVICE_INDEX,
  )
  assert.deepEqual(
    projects.map((p) => [p.serviceId, p.route]),
    [
      ['retrieval', '/projects/retrieval/'],
      ['vision', '/projects/vision/'],
      ['policy', '/projects/policy/'],
      ['review', '/projects/review/'],
    ],
  )
  assert.deepEqual([...SERVICE_ORDER], projects.map((p) => p.serviceId))
  for (const project of projects) assert.equal(projectFor(project.serviceId), project)
})

test('every existing fact in portfolio.ts is untouched (spot checks against the pre-v3 values)', () => {
  assert.equal(profile.email, 'ruphakv@gmail.com')
  assert.equal(profile.phone, '+91 7708358305')
  assert.equal(profile.educationPeriod, '2024 - 2028')
  assert.equal(profile.cgpa, '8.5/10')
  assert.deepEqual(projects[0].metrics.map((m) => `${m.value} ${m.label}`), ['87% retrieval precision', '100K token corpora', '<2s p95 latency'])
  assert.deepEqual(projects[1].metrics.map((m) => `${m.value} ${m.label}`), ['<30ms inference', '94% mAP@0.5', '30 sustained FPS'])
  assert.deepEqual(projects[2].metrics.map((m) => `${m.value} ${m.label}`), ['200+ concurrent users', '120ms query latency', '0 cross-tenant leaks'])
  assert.deepEqual(projects[3].metrics.map((m) => `${m.value} ${m.label}`), ['80% routine review automated', '-45% median PR cycle', '<3m pipeline time'])
  assert.deepEqual(experience.map((e) => e.period), ['Jun 2026 - Jul 2026', 'Sep 2025 - Feb 2026', 'Sep 2022 - Sep 2024'])
  assert.equal(highlights.length, 4)
})

test('owner override: the phone is published on the page by default (never in the agent files, see prerender)', () => {
  assert.equal(profile.publishPhone, true)
})

test('the hero copy matches spec 3.2', () => {
  const t = copy.controlRoom
  assert.equal(t.eyebrow, 'RUPHAK VARMAA S · BACKEND AND AI SYSTEMS · COIMBATORE')
  assert.equal(t.h1, 'I build backend and AI systems.')
  assert.equal(
    t.identity,
    // No "Third-year": a literal year of study is false from mid-2027 (review round 2); the period says it.
    'B.E. Computer Science and Engineering, KPR Institute of Engineering and Technology, Coimbatore · 2024 - 2028 · CGPA 8.5/10.',
  )
  assert.equal(
    t.authorship,
    'The cluster is new work, built for this site. The four services are ports of my projects; the production numbers were measured on the real systems.',
  )
  assert.equal(t.boot.prerendered, 'booting ruphak.me v3 · node 1 of 1')
  assert.equal(t.quorumPrompt.button, 'Open this page in a second tab')
  assert.equal(
    t.quorumPrompt.joined(2),
    'That tab just joined this one over BroadcastChannel. NODES 2. Close whichever tab is leader and the other takes over.',
  )
  // The tab that has just opened is the one that joined, so it says "this tab" (review round 2).
  assert.equal(
    t.quorumPrompt.joinedNew(2),
    'This tab just joined another one over BroadcastChannel. NODES 2. Close whichever tab is leader and the other takes over.',
  )
  assert.equal(t.quorumPrompt.self('tab-3b9a'), 'tab-3b9a (this tab)')
})

test('review round 2 copy: honest trace labels, spoken depth names, the pipeline pace caption, the no-JS words', () => {
  // "What broke" promises an incident: only the résumé's own (policy's 340 ms to 120 ms) keeps it.
  assert.equal(copy.services.panel.traceLabels.broke, 'What broke')
  for (const id of ['retrieval', 'vision', 'review'] as const) assert.equal(copy.services[id].trace.brokeLabel, 'What I guard against', id)
  assert.equal('brokeLabel' in copy.services.policy.trace, false, 'policy keeps "What broke": the résumé reports that one')
  for (const id of SERVICE_ORDER) assert.doesNotMatch(copy.services[id].trace.broke, /^The failure I design against/i, id)
  // The 30 s radio is read "30 seconds", not "30 S".
  assert.deepEqual(copy.services.panel.depthNames, { '30s': '30 seconds', engineer: 'Engineer', peer: 'Peer' })
  assert.equal(copy.services.panel.pipelinePace(280), 'Replayed one stage every 0.28 s so you can follow it; the times are the measured ones.')
  assert.match(copy.services.panel.pipelinePace(260), /every 0\.26 s/)
  // With JavaScript off nothing runs: the words say so instead of promising a boot and buttons.
  assert.match(copy.controlRoom.boot.noScript, /^JavaScript is off: the cluster is not running/)
  assert.match(copy.chaos.leadNoScript, /JavaScript is off/)
  assert.match(copy.chaos.leadNoScript, /no buttons/)
  // The drawings are made in code, and the colophon says so.
  assert.match(copy.colophon.credits('https://example.test/repo'), /Drawn in code as SVG, with a seeded pen wobble/)
  assert.doesNotMatch(copy.colophon.credits('x'), /by hand/)
})

test('manifest, certification and education lines are derived from the data and match spec 3.5 and 3.6', () => {
  assert.deepEqual(skillLines(), [
    'Languages — Java, Python, C++, JavaScript, TypeScript, SQL.',
    'Frameworks and libraries — React.js, Node.js, FastAPI, LangChain, OpenCV, REST APIs, WebSockets.',
    'Cloud and DevOps — AWS EC2, AWS S3, AWS Lambda, AWS ALB, Microsoft Azure, Docker, GitHub Actions, CI/CD.',
    'AI and ML — Machine Learning, Generative AI, Agentic AI, RAG Pipelines, LLM Applications, Computer Vision.',
    'Data and tools — PostgreSQL, MySQL, Azure SQL, Redis, pgvector, Prometheus, Git, Postman, Linux.',
  ])
  assert.equal(skillLines().length, skillGroups.length)
  assert.deepEqual(certificationLines(), [
    'AZ-900 — Microsoft Azure, 2024',
    'DP-700 — Microsoft Fabric, 2026',
    'LeetCode: 400+ problems solved, 1850 rating',
  ])
  assert.equal(
    educationLine(),
    'B.E. Computer Science and Engineering — KPR Institute of Engineering and Technology, Coimbatore — 2024 - 2028 — CGPA 8.5/10',
  )
})

test('deploy history: every release maps to an experience entry and the tags are the spec tags, newest first', () => {
  assert.deepEqual(
    releases().map((r) => [r.tag, r.role, r.organization, r.period, r.proof]),
    [
      ['v2026.06', 'AWS Student Builder Campus Leader', 'Amazon Web Services', 'Jun 2026 - Jul 2026', undefined],
      ['v2025.09', 'Google Student Ambassador', 'Google', 'Sep 2025 - Feb 2026', '300+ students reached'],
      ['v2022.09', 'Chief Development Officer, Co-Founder', 'Neural Inverse', 'Sep 2022 - Sep 2024', '10,000+ records managed'],
    ],
  )
  assert.equal(copy.deployHistory.neuralInverseNote, undefined, 'owner item 1: no explanatory note unless the owner writes one')
})

test('every service has depth copy at all three depths, a work trace, a caption, a stamp and the right schematic parts', () => {
  const expectedNodes = {
    retrieval: ['ingest', 'chunk', 'pgvector', 'agents', 'rerank', 'citations'],
    vision: ['camera', 'queue', 'yolo', 'websocket', 'react', 'prometheus'],
    policy: ['jwt', 'api', 'evaluator', 'rls', 'audit', 'indexes'],
    review: ['diff', 'actions', 'docker', 'eslint', 'semgrep', 'llm', 'tier', 'comments'],
  } as const
  SERVICE_ORDER.forEach((id, index) => {
    const service = copy.services[id]
    assert.equal(service.label, `SERVICE 0${index + 1}`)
    for (const depth of DEPTHS) assert.ok(service.depth[depth].length > 40, `${id} ${depth}`)
    for (const key of ['decisions', 'tradeoffs', 'broke', 'change'] as const) assert.ok(service.trace[key].length > 20)
    assert.ok(service.plain.length > 20, `${id} needs a plain-language caption`)
    assert.ok(service.caption.length > 40, `${id} needs the honest caption`)
    assert.ok(service.stamp === 'PORT' || service.stamp === 'RULES ONLY')
    assert.deepEqual(service.schematic.nodes.map((n) => n.id), expectedNodes[id])
    // Node copy lives in its own lazily loaded module and must cover exactly the same parts at every depth.
    assert.deepEqual(Object.keys(NODE_COPY[id]), expectedNodes[id])
    for (const node of expectedNodes[id]) for (const depth of DEPTHS) assert.ok(NODE_COPY[id][node][depth].length > 15, `${id}.${node}.${depth}`)
  })
  assert.equal(copy.services.review.stamp, 'RULES ONLY')
  assert.equal(copy.services.retrieval.stamp, 'PORT')
})

test('the 256-vs-512 honesty sentence is in the retrieval caption and the vision production claim is not rewritten', () => {
  assert.match(copy.services.retrieval.caption, /256-wordpiece windows with 64 overlap/)
  assert.match(copy.services.retrieval.caption, /Production used 512-token windows and pgvector/)
  assert.equal(copy.services.vision.demo.deviceFps(19), 'your device: 19 FPS')
  assert.match(copy.services.vision.caption, /fine-tuned YOLOv8 at <30 ms/)
})

test('chaos lab reward lines carry live values into the spec sentences', () => {
  const e = copy.chaos.experiments
  assert.equal(
    e.plug.reward({ sibling: 'policy-a', retry: 1, ms: 38 }),
    'You just killed a worker. The scheduler retried the job on policy-a — retry 1, recovered in 38 ms. That is failover, on a static page.',
  )
  assert.equal(e.tab.reward({ leaderId: 'tab-a1b2', term: 1 }), 'Two tabs, one cluster. They found each other over BroadcastChannel and agree on the leader: tab-a1b2, term 1.')
  assert.equal(
    e.leader.reward({ nodeId: 'tab-c3d4', term: 2 }),
    'Leader lost. tab-c3d4 took the lock and became leader; term is now 2. Every remaining tab was told.',
  )
  assert.equal(e.leader.instruction(true), 'Close the tab marked LEADER (it is this tab).')
  assert.equal(copy.chaos.stamp, 'CERTIFIED OPERATOR')
})

test('the policy fuzz result line is built from measured numbers only', () => {
  const line = copy.services.policy.demo.fuzzResult({ leaks: 0, evaluated: 10000, perSecond: 52000, p95ms: 0.01 })
  assert.equal(line, '0 cross-tenant leaks · 10,000 evaluations · 52,000 evals/s · p95 0.01 ms · verified in your browser just now')
  assert.match(copy.services.policy.demo.fuzzResult({ leaks: 3, evaluated: 9000, perSecond: 1, p95ms: 1 }), /^3 cross-tenant leaks · 9,000 evaluations/)
})

/**
 * "Never invent numbers": every number in the prose must come from portfolio.ts or from a number the spec
 * itself introduces for the in-browser ports. A new number in copy.ts or node-copy.ts fails this test until
 * someone decides, on purpose, that it is allowed.
 */
test('no invented numbers: every figure in the prose is traceable to the data or to the spec', () => {
  // A figure is a run of digits (with , or . inside) that does not touch a letter, so names like BM25, p95,
  // v2026.06 and v3.0 are not counted as numbers.
  const numbers = (text: string) => text.match(/(?<![A-Za-z0-9]|\d[.,])\d[\d,.]*\d(?![A-Za-z])|(?<![A-Za-z0-9]|\d[.,])\d(?![A-Za-z0-9])/g) ?? []
  const fromData: string[] = []
  const loose = (text: string) => text.match(/\d[\d,.]*\d|\d/g) ?? [] // "340ms" counts as 340 here
  const collect = (value: unknown) => {
    if (typeof value === 'string') fromData.push(...loose(value))
    else if (Array.isArray(value)) value.forEach(collect)
    else if (value && typeof value === 'object') Object.values(value).forEach(collect)
  }
  collect(projects)
  collect(experience)
  collect(skillGroups)
  collect(highlights)
  collect(profile)
  const specNumbers = [
    '256', '64', '512', // window and overlap (spec 3.3a)
    '23', '14', '3.5', '320', // model and runtime sizes, detector input (spec 3.3a, 3.3b)
    '10,000', // fuzz size (spec 3.3c)
    '4', // ring buffer capacity (spec 4.4) and the 4 s clip
    '01', '02', '03', '04', '05', '06', '07', // section and service labels
    '0', '1', '2', '3', '5', // tier count (five tiers), "term 2", "NODES 2", "retry 1", T1..T5
    '30', // "30 s" depth label (also a metric)
    '3', // "all three done", three depths
    '2026', '2025', '2024', '2022', '1', // changelog years, version numbers
  ]
  const allowed = new Set([...fromData, ...specNumbers])
  const offenders: string[] = []
  const check = (value: unknown, path: string) => {
    if (typeof value === 'string') {
      // Template-produced labels such as `SERVICE 01` and tier names are covered by the allowed list above.
      for (const n of numbers(value)) if (!allowed.has(n)) offenders.push(`${path}: "${n}" in "${value.slice(0, 80)}"`)
    } else if (Array.isArray(value)) value.forEach((item, i) => check(item, `${path}[${i}]`))
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) check(item, `${path}.${key}`)
  }
  check(copy, 'copy')
  check(NODE_COPY, 'NODE_COPY')
  assert.deepEqual(offenders, [])
})
