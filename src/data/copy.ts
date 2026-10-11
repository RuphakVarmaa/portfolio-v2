import { experience, highlights, profile, projects, skillGroups } from './portfolio.ts'
import type { ServiceKey } from './portfolio.ts'

/**
 * ALL prose for the QUORUM site (spec section 3), keyed by section. Sections import from here and never
 * hard-code sentences. Facts (numbers, dates, names, stacks) are NOT repeated here: they are read from
 * `portfolio.ts` so they cannot drift from the résumé.
 *
 * Paragraphs marked [OWNER REVIEW] were drafted strictly from the résumé bullets; the owner edits them
 * here if any sentence overstates.
 *
 * This file is imported by build scripts under Node type stripping: erasable TypeScript only (no enums,
 * namespaces or parameter properties), explicit `.ts` extensions, `import type` for types.
 */

// ---- shared types ---------------------------------------------------------------------------------

export type { ServiceKey } from './portfolio.ts'

/** Explanation depth. `30s` is the default everywhere except /projects/* routes, which default to `engineer`. */
export type Depth = '30s' | 'engineer' | 'peer'
export const DEPTHS: readonly Depth[] = ['30s', 'engineer', 'peer']

export type DepthText = Record<Depth, string>

export interface NodeCopy {
  /** Matches the node id in src/data/schematics.ts. */
  id: string
  /** Shown on the schematic node. A trailing "(...)" renders as a smaller second line. */
  label: string
  // What the node's dialog says at each depth lives in src/data/node-copy.ts (loaded on first click).
}

export interface WorkTrace {
  decisions: string
  tradeoffs: string
  broke: string
  change: string
}

export interface ServiceCopyBase {
  /** `SERVICE 01` ... `SERVICE 04` */
  label: string
  /** Panel body at each depth. Same facts, three levels of detail. */
  depth: DepthText
  /** [OWNER REVIEW] Decisions / Trade-offs / What broke / What I'd change. */
  trace: WorkTrace
  /** Plain-language caption: visible while "Plain language" is on. */
  plain: string
  /** The honest caption: always visible, never hidden by any toggle. */
  caption: string
  stamp: 'PORT' | 'RULES ONLY'
  /** Label of the tap that downloads a model/runtime, where the service has one. */
  tapLabel?: string
  /** Stage names for "Show me the pipeline", in order. */
  pipeline: readonly string[]
  schematic: { title: string; desc: string; nodes: readonly NodeCopy[] }
}

/** The spec's `ServiceCopy` is the base shape; each service adds its own demo strings on top. */
export type ServiceCopy = ServiceCopyBase

// ---- helpers over data ----------------------------------------------------------------------------

const project = (serviceId: ServiceKey) => {
  const found = projects.find((p) => p.serviceId === serviceId)
  if (!found) throw new Error(`No project for service "${serviceId}"`)
  return found
}

/** `Languages — Java, Python, C++, JavaScript, TypeScript, SQL.` one line per group, items verbatim from the data. */
export const skillLines = (): string[] => skillGroups.map((group) => `${group.label} — ${group.items.join(', ')}.`)

/** `AZ-900 — Microsoft Azure, 2024` and `DP-700 — Microsoft Fabric, 2026`, derived from `highlights`. */
export const certificationLines = (): string[] => {
  const byValue = new Map(highlights.map((h) => [h.value, h]))
  const lines: string[] = []
  for (const value of ['AZ-900', 'DP-700']) {
    const h = byValue.get(value)
    if (h) lines.push(`${h.value} — ${h.label}`)
  }
  const solved = byValue.get('400+')
  const rating = byValue.get('1850')
  if (solved && rating) lines.push(`LeetCode: ${solved.value} problems solved, ${rating.value} rating`)
  return lines
}

/** `B.E. Computer Science and Engineering — KPR Institute of Engineering and Technology, Coimbatore — 2024 - 2028 — CGPA 8.5/10` */
export const educationLine = (): string =>
  `${profile.degree} — ${profile.institution} — ${profile.educationPeriod} — CGPA ${profile.cgpa}`

// ---- the copy -------------------------------------------------------------------------------------

const retrieval = {
  label: 'SERVICE 01',
  depth: {
    '30s':
      'I built a retrieval system that answers questions over documents of up to 100K tokens and shows where every answer came from. It reached 87% retrieval precision and answered in under two seconds at p95, for more than 50 concurrent sessions.',
    engineer:
      'A multi-agent RAG pipeline on LangChain and GPT-4 over 100K-token corpora. Chunks are 512-token sliding windows; pgvector with HNSW indexing does the nearest-neighbour pass, cosine-similarity reranking tightens it, and structured citation metadata keeps every answer grounded. The FastAPI service runs horizontally scaled on AWS EC2 behind an ALB for more than 50 concurrent sessions. The result: 87% retrieval precision, sub-2 s p95, and a 70% reduction in manual document analysis time.',
    peer:
      'Agents split a question into retrieval sub-goals; each sub-goal queries the pgvector HNSW index and reranks by cosine before synthesis, with citation metadata carried through so the answer can be audited back to the chunk. The chunking is adaptive 512-token sliding windows, the chunking behind the 70% cut in manual document analysis time. Because the windows overlap, a clause or a table row is less likely to be split across two chunks. Horizontal FastAPI replicas behind an ALB kept p95 under 2 s at 50+ concurrent sessions.',
  },
  trace: {
    decisions:
      'Sliding windows over fixed blocks; HNSW over exact search so the nearest-neighbour pass can stay inside the p95 budget as the corpus grows; citations carried as structured metadata rather than parsed back out of the answer.',
    tradeoffs:
      'Overlapping windows mean more vectors to store and embed. I accept that cost so a fact is less likely to be cut in half at a chunk boundary.',
    broke:
      'The failure I design against in a retrieval system: an answer with no citation can look right and still be wrong. That is why every answer carries structured citation metadata, so it can be checked against the chunk it came from.',
    change: 'Measure precision per document type, not just overall, so a weak spot in tables or in prose cannot hide inside one average.',
  },
  plain:
    "This is a search box that reads this website's own text. Ask it something and it shows you the exact passage it found, so you can check the answer yourself.",
  caption:
    "A port, not the production system. Retrieval and citation run entirely in your browser over this page's own text. Production used 512-token windows and pgvector; this port uses 256-wordpiece windows with 64 overlap because the in-browser encoder's effective context is 256, and BM25 or MiniLM embeddings instead of pgvector. No LLM, no API: retrieval and grounding are the demonstrable part.",
  stamp: 'PORT',
  tapLabel: 'Load the embedding model — 23 MB model + 14 MB runtime, once, cached on this device',
  pipeline: ['tokenize', 'embed (or BM25)', 'score', 'rerank', 'cite'],
  demo: {
    label: 'ASK THE SITE',
    placeholder: 'What did Ruphak do with pgvector?',
    chips: ['What broke in the RBAC project?', 'How was latency variance reduced?', 'Which cloud did Neural Inverse use?'],
    noResults: 'Nothing on this page matches that well. Try one of the suggestions.',
    modelMissing: 'Embedding model not published yet; BM25 is live.',
  },
  schematic: {
    title: 'Retrieval pipeline',
    desc: 'Schematic: documents are ingested and chunked into 512-token windows that feed a pgvector HNSW index. Agents query the index, results are reranked by cosine similarity, and the answer is returned with citations.',
    nodes: [
      {
        id: 'ingest',
        label: 'ingest',
      },
      {
        id: 'chunk',
        label: 'chunk (512-token windows)',
      },
      {
        id: 'pgvector',
        label: 'pgvector HNSW',
      },
      {
        id: 'agents',
        label: 'agents',
      },
      {
        id: 'rerank',
        label: 'rerank (cosine)',
      },
      {
        id: 'citations',
        label: 'citations',
      },
    ],
  },
} satisfies ServiceCopyBase & { demo: Record<string, unknown> }

const vision = {
  label: 'SERVICE 02',
  depth: {
    '30s':
      'I built a live object-detection pipeline that turns camera frames into streaming analytics. It detects in under 30 ms per frame at 94% mAP@0.5 and keeps a steady 30 frames per second on screen.',
    engineer:
      'YOLOv8 fine-tuned on a 5K-image custom dataset, with bounding-box telemetry streamed over WebSockets and per-class analytics rendered in React.js at a sustained 30 FPS. An asyncio producer–consumer queue between capture and inference reduced latency variance by 40%. Inference p95, detection rate and queue depth are instrumented in Prometheus with SLO alerts.',
    peer:
      'The queue is the design: capture produces, inference consumes, and a bounded buffer between them keeps the consumer fed without letting latency pile up. The asyncio producer–consumer queue is what cut latency variance by 40%; the port in your browser uses a drop-oldest ring buffer to show the same idea. Telemetry leaves the process as WebSocket frames, and the three SLOs (inference p95, detection rate, queue depth) alert in Prometheus so a regression shows up as a page, not a feeling.',
  },
  trace: {
    decisions:
      'A producer–consumer queue between capture and inference instead of running them back to back; SLO alerts on the three numbers that describe health: inference p95, detection rate and queue depth.',
    tradeoffs:
      'A queue that sheds load keeps latency flat but can lower the detection rate; the alerts watch inference p95, detection rate and queue depth, so none of them is traded away silently.',
    broke:
      'In a live pipeline the thing to guard is latency variance, not just the mean: a fine average can hide a stuttering tail. The producer–consumer queue is what cut that variance by 40%.',
    change: 'Export the per-class analytics as a Prometheus histogram too, so the dashboard and the alerts read from the same source.',
  },
  plain:
    'This points a camera at the world and draws a box around each object it recognises, while counting how many pictures per second it can keep up with.',
  caption:
    "A port. YOLOv8n int8 at 320 px runs single-threaded in WebAssembly here; the production system ran a fine-tuned YOLOv8 at <30 ms. Your numbers are your device's numbers.",
  stamp: 'PORT',
  tapLabel: 'Load the detector — 3.5 MB model + 14 MB runtime, once, cached',
  pipeline: ['capture', 'queue', 'infer', 'draw'],
  demo: {
    cameraButton: 'Use my camera',
    dropImage: 'Or drop an image',
    clip: 'Or run the recorded clip (4 s, filmed by me)',
    phoneExtra: 'Shake the phone: motion events feed the same queue as frames, so you can watch backpressure engage.',
    consent: {
      title: 'Use your camera?',
      body: 'This runs YOLOv8n inside your browser. Frames never leave your device; nothing is uploaded or stored. The camera stops when you scroll away or press Stop.',
      allow: 'Allow camera',
      deny: 'Not now',
    },
    /**
     * What the panel says while no detector is published with this build (review finding R1): a caption that says
     * "YOLOv8n runs here" above a panel that detects nothing is not honest. The prerendered HTML and the first moment of
     * a visit take this wording too (see src/sections/services/vision/noDetector.ts). The production claim is unchanged.
     */
    noDetector: {
      /** Replaces `plain` ("draws a box around each object it recognises"). */
      plain:
        'This points a camera at the world and counts how many pictures per second it can keep up with. The part that recognises objects and draws a box around each one is not published yet, so no boxes appear. The line of waiting pictures and the counters are real.',
      /** Replaces `caption`. Keeps the production claim and the "your numbers" sentence. */
      caption:
        "A port. The detector (YOLOv8n) is not published on this site yet, so nothing is detected; the camera, the bounded queue and the gauges are real and run on your device. The production system ran a fine-tuned YOLOv8 at <30 ms. Your numbers are your device's numbers.",
      /** Replaces `consent.body`: says what Allow really does when there is nothing to detect with. */
      consent:
        'Frames go through the queue in your browser; no detector is loaded, so nothing is recognised. Frames never leave your device; nothing is uploaded or stored. The camera stops when you scroll away or press Stop.',
    },
    gauges: { inference: 'inference p95 (ms)', queue: 'queue depth', dropped: 'dropped frames' },
    /** Shown beside the unchanged production `30 sustained FPS` metric when the device is slower. */
    deviceFps: (fps: number) => `your device: ${fps} FPS`,
    backpressure: 'backpressure engaged',
    noRecording: 'No recorded run published yet.',
  },
  schematic: {
    title: 'Vision pipeline',
    desc: 'Schematic: a camera feeds a bounded queue; frames are detected by YOLOv8, whose results stream over a WebSocket to React analytics and are instrumented in Prometheus.',
    nodes: [
      {
        id: 'camera',
        label: 'camera',
      },
      {
        id: 'queue',
        label: 'queue (bounded)',
      },
      {
        id: 'yolo',
        label: 'YOLOv8',
      },
      {
        id: 'websocket',
        label: 'WebSocket',
      },
      {
        id: 'react',
        label: 'React analytics',
      },
      {
        id: 'prometheus',
        label: 'Prometheus',
      },
    ],
  },
} satisfies ServiceCopyBase & { demo: Record<string, unknown> }

const policy = {
  label: 'SERVICE 03',
  depth: {
    '30s':
      "I built a task platform where many companies share one system and none can see another's data. It held 200+ people at once with zero cross-tenant leaks across more than 10,000 policy checks per session, and I cut query time from 340 ms to 120 ms.",
    engineer:
      'Role-based access control with JWT authentication, row-level PostgreSQL policies and per-tenant audit logging. Load-tested with more than 200 concurrent users: zero cross-tenant leakage across 10K+ policy evaluations per session. Query latency fell from 340 ms to 120 ms by removing N+1 patterns and adding tenant-scoped composite indexes; connection-pool reuse was tuned to keep latency stable in bursts.',
    peer:
      "Tenant isolation is enforced twice: the JWT carries the tenant claim, and row-level policies in PostgreSQL refuse rows from any other tenant even if application code gets it wrong. Every evaluation writes an audit line keyed by tenant. The 340→120 ms came from two changes: collapsing N+1 query fans into joins, and composite indexes that lead with tenant_id so the planner stays inside one tenant's slice.",
  },
  trace: {
    decisions:
      'Enforce isolation in the database with row-level policies, not only in application checks; audit per tenant from day one.',
    tradeoffs:
      'Row-level policies add a predicate to every query; the tenant-scoped composite indexes are what kept that predicate cheap.',
    broke:
      'Queries were taking 340 ms. The cause was N+1 fans and indexes that did not lead with the tenant; fixing both took it to 120 ms.',
    change: 'Run the cross-tenant fuzz in CI on every change, the way this page runs it in your browser.',
  },
  plain:
    'Pick who is asking and what they want to do; the rulebook says allow or deny and writes down why. The big button tries ten thousand requests, half of them from the wrong company, and counts how many get through.',
  caption:
    'A TypeScript port of the policy logic. In production the same rules were enforced by PostgreSQL row-level policies and JWT claims; the 200+ user figure is from the production load test, not from this fuzz.',
  stamp: 'PORT',
  pipeline: ['verify', 'evaluate', 'audit'],
  demo: {
    label: 'POLICY PLAYGROUND',
    selectors: { tenant: 'Tenant', role: 'Role', resource: 'Resource', action: 'Action' },
    allow: 'ALLOW',
    deny: 'DENY',
    tapeHeader: 'AUDIT LOG (what the production system would write)',
    fuzzButton: 'Fuzz it: 10,000 cross-tenant evaluations',
    plugButton: 'Pull the plug mid-fuzz',
    /** Every number is measured by the run; nothing here is a constant. */
    fuzzResult: (r: { leaks: number; evaluated: number; perSecond: number; p95ms: number }) =>
      `${r.leaks} cross-tenant leaks · ${r.evaluated.toLocaleString('en-US')} evaluations · ${r.perSecond.toLocaleString('en-US')} evals/s · p95 ${r.p95ms} ms · verified in your browser just now`,
  },
  schematic: {
    title: 'Policy pipeline',
    desc: 'Schematic: a JWT identifies the caller to the Node.js API; the policy evaluator decides allow or deny, writes the audit log and defers to PostgreSQL row-level policies, which rely on tenant-scoped indexes.',
    nodes: [
      {
        id: 'jwt',
        label: 'JWT',
      },
      {
        id: 'api',
        label: 'API (Node.js)',
      },
      {
        id: 'evaluator',
        label: 'policy evaluator',
      },
      {
        id: 'rls',
        label: 'row-level policies',
      },
      {
        id: 'audit',
        label: 'audit log',
      },
      {
        id: 'indexes',
        label: 'tenant-scoped indexes',
      },
    ],
  },
} satisfies ServiceCopyBase & { demo: Record<string, unknown> }

const review = {
  label: 'SERVICE 04',
  depth: {
    '30s':
      'I built a pipeline that reviews every pull request automatically and posts comments inline. It automated 80% of routine review work across a 12-engineer repository, cut the median PR cycle by 45%, and runs in under three minutes.',
    engineer:
      'A GitHub Actions workflow evaluates every PR diff and posts inline feedback. Findings are classified across OWASP Top-10, logic bugs, performance, style and maintainability into five severity tiers. Structured LLM review is combined with ESLint and Semgrep inside a Dockerized stage. Result: 80% of routine review overhead automated across a 12-engineer repository, median PR cycle down 45%, pipeline under 3 minutes.',
    peer:
      'The LLM stage emits structured findings, not prose, so they merge with ESLint and Semgrep output into one tiered list and one set of inline comments. Five severity tiers separate what is urgent from what is advisory, and the whole Docker stage runs in under three minutes.',
  },
  trace: {
    decisions:
      'Structured output from the LLM so it can be merged with deterministic tools; five tiers so severity is a decision, not a vibe; Docker so the stage is reproducible.',
    tradeoffs:
      'A tighter time budget means fewer rules per run. I accept that to keep the whole pipeline under three minutes.',
    broke:
      'The failure I design against: free-form review text cannot be deduplicated against ESLint and Semgrep output, so one issue could be reported three ways. Structured findings are what let the three sources merge into one list.',
    change: 'Track precision per tier over time so false positives in the lower tiers can be pruned with evidence.',
  },
  plain:
    'Paste a few lines of JavaScript and the page reads them the way a code reviewer would, sorting what it finds into five levels of seriousness.',
  caption:
    'Rules only. The production pipeline added an LLM stage; here the Semgrep-style rules and a small AST pass run entirely in your browser. Five tiers, same shapes.',
  stamp: 'RULES ONLY',
  pipeline: ['parse', 'lint patterns', 'AST pass', 'tier', 'post'],
  demo: {
    label: 'REVIEW A SNIPPET',
    placeholder: 'Paste JavaScript here, or pick a seeded diff',
    seeds: ['express-route.js', 'async-worker.js', 'profile-card.jsx'],
    astSkipped: 'skipped: not parseable as JavaScript',
    /** Severity tiers: shape + label, never colour alone. */
    tiers: [
      { tier: 1, name: 'Critical', shape: '◆', label: 'T1 Critical ◆' },
      { tier: 2, name: 'High', shape: '▲', label: 'T2 High ▲' },
      { tier: 3, name: 'Medium', shape: '●', label: 'T3 Medium ●' },
      { tier: 4, name: 'Low', shape: '■', label: 'T4 Low ■' },
      { tier: 5, name: 'Info', shape: '○', label: 'T5 Info ○' },
    ],
  },
  schematic: {
    title: 'Review pipeline',
    desc: 'Schematic: a pull request diff triggers GitHub Actions, which runs a Docker stage containing ESLint, Semgrep and a structured LLM review; their findings are merged into five severity tiers and posted as inline comments.',
    nodes: [
      {
        id: 'diff',
        label: 'PR diff',
      },
      {
        id: 'actions',
        label: 'GitHub Actions',
      },
      {
        id: 'docker',
        label: 'Docker stage',
      },
      {
        id: 'eslint',
        label: 'ESLint',
      },
      {
        id: 'semgrep',
        label: 'Semgrep',
      },
      {
        id: 'llm',
        label: 'LLM (structured)',
      },
      {
        id: 'tier',
        label: 'tier',
      },
      {
        id: 'comments',
        label: 'inline comments',
      },
    ],
  },
} satisfies ServiceCopyBase & { demo: Record<string, unknown> }

export const copy = {
  // ---- shell -------------------------------------------------------------------------------------
  header: {
    wordmark: 'RUPHAK VARMAA S',
    homeLabel: 'Ruphak Varmaa S, home',
    skipLink: 'Skip to content',
    railLabel: 'Quick view',
    rail: [
      { label: 'Projects', href: '/#services', key: 'p', id: 'services' },
      { label: 'Résumé', href: '/resume/', key: 'r', id: 'resume' },
      { label: 'Contact', href: '/#contact', key: 'c', id: 'contact' },
    ],
    keyHint: 'p r c',
    readout: { label: 'Cluster status', nodes: 'NODES', term: 'TERM', up: 'UP' },
    controlsLabel: 'Display options',
    menu: { open: 'Open menu', close: 'Close menu', title: 'Display options' },
    toggles: {
      plain: {
        label: 'Plain language',
        short: 'Plain',
        title: 'Show a plain-language caption under every panel',
      },
      machine: {
        label: 'Skip the machine',
        short: 'Skip machine',
        title: 'Collapse the board, the status strip and the chaos lab to plain lists',
        forced: 'Skip the machine is on because this device runs the Basic tier',
      },
      // Labels are constant and the buttons carry aria-pressed: "Ink" pressed = the Ink theme is on.
      theme: { paper: 'Paper', ink: 'Ink', title: 'Switch between the Paper and Ink themes' },
      motion: {
        label: 'Lite motion',
        title: 'Lite motion removes animation and batches live numbers',
        forced: 'Lite motion is on because your system asks for reduced motion',
      },
      sound: {
        label: 'Sound',
        title: 'Relay clicks and a leader hum, synthesized in your browser',
        on: 'Sound on',
        off: 'Sound off',
      },
    },
    keys: {
      title: 'Keyboard shortcuts',
      lead: 'Shortcuts are ignored while you are typing in a field.',
      close: 'Close',
      rows: [
        { keys: ['p'], text: 'Projects' },
        { keys: ['r'], text: 'Résumé' },
        { keys: ['c'], text: 'Contact' },
        { keys: ['2'], text: 'Open this page in a second tab' },
        { keys: ['?'], text: 'Show this sheet' },
        { keys: ['Esc'], text: 'Close a dialog, stop the camera' },
      ],
    },
    tier: {
      label: 'Device tier',
      auto: 'Automatic',
      applies: 'Applies after a reload.',
      names: { full: 'Full', standard: 'Standard', basic: 'Basic' },
    },
  },

  strip: {
    label: 'Cluster status',
    leader: 'LEADER',
    thisTab: 'this tab',
    nodes: 'NODES',
    term: 'TERM',
    up: 'UP',
    noLeader: 'no leader',
  },

  notFound: {
    title: 'Page not found',
    body: 'There is no page at this address. The home page has everything, and the project pages are linked from it.',
    link: 'Back to the home page',
  },

  // ---- 1 Control Room (spec 3.2) -----------------------------------------------------------------
  controlRoom: {
    id: 'control-room',
    label: '01',
    eyebrow: 'RUPHAK VARMAA S · BACKEND AND AI SYSTEMS · COIMBATORE',
    h1: 'I build backend and AI systems.',
    lead: 'This website is one. It is a small cluster running in your browser: the workers are the nodes, your tabs form a quorum, and my four projects run as live services you can start, break and watch recover.',
    plain:
      'Workers are little helpers inside your browser. The leader hands out jobs. Open this page in a second tab and the two tabs start talking; close the leader and the other one takes over.',
    identity: `Third-year ${profile.degree}, ${profile.institution} · ${profile.educationPeriod} · CGPA ${profile.cgpa}.`,
    authorship:
      'The cluster is new work, built for this site. The four services are ports of my projects; the production numbers were measured on the real systems.',
    boot: {
      /** What the prerendered HTML says; replaced by the measured line after hydration. */
      prerendered: 'booting ruphak.me v3 · node 1 of 1',
      closing: 'no backend was harmed; this trace is yours.',
    },
    quorumPrompt: {
      button: 'Open this page in a second tab',
      hint: 'or press 2',
      blocked: 'Your browser blocked the pop-up; duplicate the tab manually.',
      /** Reward line (live region) once a peer has joined; `nodes` is the measured node count. */
      joined: (nodes: number) =>
        `That tab just joined this one over BroadcastChannel. NODES ${nodes}. Close whichever tab is leader and the other takes over.`,
      unsupported:
        'Your browser does not expose BroadcastChannel or Web Locks, so this tab runs as a single node. Everything else works.',
    },
    serviceIndex: {
      label: 'SERVICE INDEX',
      heading: 'Four projects, four live services',
      links: { resumeHtml: 'Résumé (HTML)', resumePdf: 'Résumé (PDF)', contact: 'Contact' },
      /** `Résumé (HTML) · Résumé (PDF) · Contact` is rendered from `links`, in this order. */
    },
    board: {
      srDescription:
        'Switchboard diagram: a control-plane relay in the centre connected by patch cables to lamps for Retrieval, Vision, Policy and Review. Lamps light when each worker is ready; cables pulse when a message passes.',
      plain: 'Each lamp is a real worker. It lights the moment the worker says it is ready.',
      sensorsLamp: 'SENSORS',
      sensorsCaption: "Your phone can do something the laptop can't — scroll to Vision.",
      controlPlane: 'CONTROL PLANE',
      /** Names for lamp buttons: "Retrieval — Agentic RAG Document Intelligence — ready". */
      lampName: (short: string, title: string, status: string) => `${short} — ${title} — ${status}`,
      /** Words for `ServicePhase` (src/cluster/phase.ts). */
      status: { standby: 'standby', starting: 'starting', ready: 'ready', busy: 'working', degraded: 'degraded', down: 'down' },
      shortNames: { retrieval: 'RETRIEVAL', vision: 'VISION', policy: 'POLICY', review: 'REVIEW' },
    },
    /** Under "Skip the machine" the board becomes this list. */
    machineOff: {
      // Not "Services": the next section on the page has that title, and two headings with one name read as a mistake.
      heading: 'Service status',
      note: 'The board is switched off. These are the same four services, as a list.',
    },
  },

  // ---- 2 Services (spec 3.3) ---------------------------------------------------------------------
  services: {
    id: 'services',
    label: '02',
    title: 'SERVICES',
    lead: 'Four projects from my résumé, each running here as an honest port. The numbers were measured on the production systems; the demo runs on your machine, right now.',
    panel: {
      depthLegend: 'Explain at',
      depthOptions: { '30s': '30 s', engineer: 'Engineer', peer: 'Peer' } satisfies DepthText,
      traceHeading: 'Work trace',
      traceLabels: { decisions: 'Decisions', tradeoffs: 'Trade-offs', broke: 'What broke', change: "What I'd change" },
      demoHeading: 'Demo',
      metricsHeading: 'Measured on the production system',
      stackLabel: 'Stack',
      plainLabel: 'In plain words',
      showPipeline: 'Show me the pipeline',
      pipelineHeading: 'Pipeline',
      pipelineIdle: 'Run it to see the real timing of each stage.',
      noRun: 'No recorded run published yet.',
      schematicHint: 'Click a part of the drawing to read about it.',
      nodeDialogClose: 'Close',
      demoLoading: 'Loading the demo…',
      demoFailed: 'The demo could not load. The description and the numbers above are unchanged.',
      standaloneBack: 'All projects',
    },
    retrieval,
    vision,
    policy,
    review,
  },

  // ---- 3 Chaos Lab (spec 3.4) --------------------------------------------------------------------
  chaos: {
    id: 'chaos-lab',
    label: '03',
    title: 'CHAOS LAB',
    lead: 'Three experiments. Buttons only; nothing runs until you press it. Each one ends by telling you exactly what you just proved.',
    experiments: {
      plug: {
        button: 'Pull the plug on policy-b',
        plain:
          'This stops one of the policy workers for real, in the middle of a job. Watch the job move to the other worker.',
        reward: (r: { sibling: string; retry: number; ms: number }) =>
          `You just killed a worker. The scheduler retried the job on ${r.sibling} — retry ${r.retry}, recovered in ${r.ms} ms. That is failover, on a static page.`,
      },
      tab: {
        button: 'Open a second tab',
        plain:
          'Two tabs of this page can find each other without any server. Open a second one and watch the node count change.',
        reward: (r: { leaderId: string; term: number }) =>
          `Two tabs, one cluster. They found each other over BroadcastChannel and agree on the leader: ${r.leaderId}, term ${r.term}.`,
      },
      leader: {
        instruction: (thisTab: boolean) => `Close the tab marked LEADER (it is ${thisTab ? 'this tab' : 'the other tab'}).`,
        plain:
          'Whichever tab is the leader holds a lock. Close it, and the browser hands that lock to the other tab, which takes over.',
        reward: (r: { nodeId: string; term: number }) =>
          `Leader lost. ${r.nodeId} took the lock and became leader; term is now ${r.term}. Every remaining tab was told.`,
      },
    },
    stamp: 'CERTIFIED OPERATOR',
    complete:
      'All three done. The Experiments lab link in the Colophon is now lit (it was always reachable at /experiments/; nothing here is gated).',
    soundCaption: 'Relay clicks are synthesized in your browser; there are no audio files.',
    machineOff: {
      heading: 'Chaos Lab',
      note: 'The chaos lab is switched off with the machine. Turn "Skip the machine" off to run the three experiments.',
    },
  },

  // ---- 4 Deploy History (spec 3.5) ---------------------------------------------------------------
  deployHistory: {
    id: 'deploy-history',
    label: '04',
    title: 'DEPLOY HISTORY',
    lead: 'Roles as releases. Dates exact.',
    plain: 'A timeline of what I have done, written the way software releases are.',
    /**
     * Newest first. Role, organization, period and proof are read from `experience` in portfolio.ts by
     * `role`; only the tag, the first-person note and the stack diff live here.
     */
    releases: [
      {
        tag: 'v2026.06',
        role: 'AWS Student Builder Campus Leader',
        note: 'Selected to lead Builder Center adoption on campus. I designed structured onboarding across EC2, S3 and Lambda and worked with AWS program managers on cloud education.',
        stackDiff: '+ Builder Center, + EC2, + S3, + Lambda',
      },
      {
        tag: 'v2025.09',
        role: 'Google Student Ambassador',
        note: 'I designed and delivered cloud computing and machine learning workshops, reaching more than 300 students through live, project-based demonstrations of Firebase, TensorFlow and Google Cloud.',
        stackDiff: '+ Firebase, + TensorFlow, + Google Cloud',
      },
      {
        tag: 'v2022.09',
        role: 'Chief Development Officer, Co-Founder',
        note: 'I architected an automated image-tagging pipeline on Azure Cognitive Services and Azure SQL and led backend and system architecture decisions across client-facing products.',
        stackDiff: '+ Azure Cognitive Services, + Azure SQL',
      },
    ],
    /** Owner-confirmation item 1: left undefined on purpose. Write a sentence here to show it under the Neural Inverse release. */
    neuralInverseNote: undefined as string | undefined,
    ledger: { educationTag: 'EDU', certificationTag: 'CERT', diffToggle: 'diff', noteToggle: 'note', proofLabel: 'Proof' },
  },

  // ---- 5 Manifest (spec 3.6) ---------------------------------------------------------------------
  manifest: {
    id: 'manifest',
    label: '05',
    title: 'MANIFEST',
    note: 'This section is rendered from /profile.json. Agents read the same file. There is also /llms.txt and a no-JS HTML résumé at /resume/.',
    plain:
      'Computers that read websites on someone\'s behalf (agents) get a tidy data file instead of having to guess from the page. This section shows that file.',
    viewAsAgent: 'View as agent',
    viewAsPeople: 'View as people',
    copy: { profile: 'Copy /profile.json URL', llms: 'Copy /llms.txt URL', resume: 'Copy /resume/ URL', copied: 'Link copied' },
    fetching: 'Fetching /profile.json from this origin…',
    fetchFailed: 'Could not fetch /profile.json (offline or running from a dev server without the prerender step).',
  },

  // ---- 6 Contact + Résumé (spec 3.7) -------------------------------------------------------------
  contact: {
    id: 'contact',
    label: '06',
    title: 'CONTACT',
    line: 'Email is best.',
    copyEmail: 'Copy email',
    emailCopied: 'Email copied',
    phoneLabel: 'Phone',
    linkedin: 'LinkedIn',
    github: 'GitHub',
    resume: { label: 'Résumé', html: 'HTML (/resume/)', pdf: 'PDF (/Ruphak-Varmaa-Resume.pdf)', htmlPath: '/resume/', pdfPath: '/Ruphak-Varmaa-Resume.pdf' },
  },

  // ---- 7 Colophon (spec 3.8) ---------------------------------------------------------------------
  colophon: {
    id: 'colophon',
    label: '07',
    title: 'COLOPHON',
    version: 'v3 · 2026 · rebuilt from a blank file.',
    /** The authorship distinction the spec repeats in the hero and here. */
    authorship: 'The cluster is new work, built for this site. The four services are ports of my projects.',
    /** Owner-confirmation item 6: replace with the exact repository URL. */
    sourceUrl: 'https://github.com/RuphakVarmaa',
    /** The credits link's words while `sourceUrl` is only the owner's GitHub account page (see src/sections/colophon/source-link.ts). */
    profileLabel: 'GitHub profile',
    credits: (sourceUrl: string) =>
      `Designed and drawn by hand (SVG), set in Big Shoulders, Atkinson Hyperlegible Next, Martian Mono and Doto. No generated imagery. The cluster — scheduler, quorum, chaos lab — was built for this site; source: ${sourceUrl}.`,
    links: {
      experiments: { label: 'Experiments (/experiments/)', href: '/experiments/' },
      makingOf: { label: 'Making-of (repo README)', hrefSuffix: '#readme' },
      changelog: { label: 'Changelog' },
    },
    changelog: [
      { id: 'v3-0', tag: 'v3.0', year: '2026', text: 'rebuilt as a running cluster' },
      { id: 'v2', tag: 'v2', year: '2025', text: 'WebGL hero' },
      { id: 'v1', tag: 'v1', year: '2024', text: '' },
    ],
    /** `v3.0 — 2026 — rebuilt as a running cluster` */
    changelogLine: (entry: { tag: string; year: string; text: string }) =>
      [entry.tag, entry.year, entry.text].filter(Boolean).join(' — '),
    buildTrace: {
      heading: 'Build trace',
      html: 'Initial HTML',
      css: 'CSS',
      js: 'JavaScript (gzip)',
      fonts: 'Fonts',
      models: 'Models and runtime',
      csp: 'Content-Security-Policy, verbatim',
      tier: 'Device tier',
      tierReasons: 'Why this tier',
      noReasons: 'Nothing limited this device.',
    },
    telemetry: {
      heading: 'Live telemetry (this session, never transmitted)',
      ttfb: 'TTFB',
      fcp: 'FCP',
      lcp: 'LCP',
      workers: 'Worker ready times',
      frames: 'Frame budget',
      dropped: 'Dropped frames',
      models: 'Model bytes',
    },
    preferences: { heading: 'Preferences' },
  },

  // ---- Résumé page (spec 3.7) --------------------------------------------------------------------
  resume: {
    title: 'Résumé',
    headings: {
      projects: 'Projects',
      experience: 'Experience',
      education: 'Education',
      certifications: 'Certifications and practice',
      skills: 'Skills',
    },
    print: 'Print',
    downloadPdf: 'Download PDF',
    website: 'Website',
  },

  // ---- /experiments/ (spec 3.8) ------------------------------------------------------------------
  experiments: {
    title: 'Experiments',
    lead: 'Small live pieces of the cluster that runs this site. Each one reads the same state the site runs on; nothing here is gated and nothing leaves your browser.',
    items: {
      trace: { title: 'Scheduler trace viewer', text: 'Every job the scheduler dispatched this session: node, attempt, duration, outcome.' },
      peers: { title: 'Quorum peer table', text: 'The tabs this tab can see, who leads, and the current term.' },
      index: { title: 'BM25 index explorer', text: "The retrieval index built over this site's own text: chunks, terms, scores." },
      meter: { title: 'Meter test bench', text: 'Drive the analog meters used on this site with your own values.' },
    },
  },
} as const

/** Service copy by id, in the order the Services section shows the panels. */
export const SERVICE_ORDER: readonly ServiceKey[] = ['retrieval', 'vision', 'policy', 'review']

export function serviceCopy<K extends ServiceKey>(id: K): (typeof copy.services)[K] {
  return copy.services[id]
}

/** The project record for a service id (title, stack, metrics, details, route). */
export function projectFor(id: ServiceKey) {
  return project(id)
}

/** `SERVICE 01` style index for a service id. */
export function serviceNumber(id: ServiceKey): number {
  return SERVICE_ORDER.indexOf(id) + 1
}

/** For tests and the Colophon: every experience entry the deploy history must cover, with its release. */
export function releases() {
  return copy.deployHistory.releases.map((release) => {
    const entry = experience.find((e) => e.role === release.role)
    if (!entry) throw new Error(`Release ${release.tag} names role "${release.role}", which is not in portfolio.ts`)
    return { ...release, organization: entry.organization, period: entry.period, proof: entry.proof }
  })
}
