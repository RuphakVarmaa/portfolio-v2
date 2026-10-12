import { copy } from './copy.ts'
import type { Depth, DepthText } from './copy.ts'
import type { ServiceKey } from './portfolio.ts'

/**
 * The four service schematics: which parts exist (labels and depth copy come from copy.ts), how they
 * connect, and where each part sits in the two layouts. The Schematic component draws them; sections
 * only call `getSchematic(service)` and add behaviour (`active`, `onNode`).
 *
 * Positions are grid cells `[column, row]`, not pixels, so the drawing scales with its container:
 *   wide    used when the schematic's container is >= 600 px
 *   narrow  used below that (two columns, three for the review pipeline; readable on a phone)
 */

export type Cell = readonly [column: number, row: number]

export interface SchematicNode {
  id: string
  /** Shown on the part. A trailing "(...)" is set smaller on its own line. */
  label: string
  /**
   * What the part's dialog says at each depth. Optional: when omitted the Schematic loads it from
   * src/data/node-copy.ts using `SchematicProps.service`, on the first click.
   */
  copy?: DepthText
  wide: Cell
  narrow: Cell
}

export type SchematicEdge = readonly [from: string, to: string]

export interface SchematicProps {
  /** Which service's node copy to load when a part is opened (set by `getSchematic`). */
  service?: ServiceKey
  /** Becomes the SVG `<title>`. */
  title: string
  /** Becomes the SVG `<desc>` (the long description for assistive technology). */
  desc: string
  nodes: readonly SchematicNode[]
  edges: readonly SchematicEdge[]
  /** Node ids drawn "live" (vermilion tint), e.g. the stages currently running. */
  active?: readonly string[]
  /** Small mono text under a node's label, e.g. a measured `12 ms`. Keyed by node id. */
  annotations?: Readonly<Record<string, string>>
  /** Called when a part is activated (the dialog opens regardless). */
  onNode?: (id: string) => void
  /** Depth of the dialog copy. ServicePanel fills this from the preferences; standalone use passes it. */
  depth?: Depth
  className?: string
}

export interface SchematicDefinition {
  service: ServiceKey
  title: string
  desc: string
  nodes: SchematicNode[]
  edges: SchematicEdge[]
}

interface Placement {
  wide: Cell
  narrow: Cell
}

const LAYOUT: Record<ServiceKey, { placements: Record<string, Placement>; edges: SchematicEdge[] }> = {
  retrieval: {
    placements: {
      ingest: { wide: [0, 0], narrow: [0, 0] },
      chunk: { wide: [1, 0], narrow: [1, 0] },
      agents: { wide: [1, 1], narrow: [0, 1] },
      pgvector: { wide: [2, 0], narrow: [1, 1] },
      rerank: { wide: [3, 0], narrow: [1, 2] },
      citations: { wide: [4, 0], narrow: [0, 2] },
    },
    edges: [
      ['ingest', 'chunk'],
      ['chunk', 'pgvector'],
      ['agents', 'pgvector'],
      ['pgvector', 'rerank'],
      ['rerank', 'citations'],
    ],
  },
  vision: {
    placements: {
      camera: { wide: [0, 0], narrow: [0, 0] },
      queue: { wide: [1, 0], narrow: [1, 0] },
      yolo: { wide: [2, 0], narrow: [1, 1] },
      websocket: { wide: [3, 0], narrow: [1, 2] },
      react: { wide: [4, 0], narrow: [0, 2] },
      prometheus: { wide: [3, 1], narrow: [0, 1] },
    },
    edges: [
      ['camera', 'queue'],
      ['queue', 'yolo'],
      ['yolo', 'websocket'],
      ['websocket', 'react'],
      ['yolo', 'prometheus'],
    ],
  },
  policy: {
    placements: {
      jwt: { wide: [0, 0], narrow: [0, 0] },
      api: { wide: [1, 0], narrow: [1, 0] },
      evaluator: { wide: [2, 0], narrow: [1, 1] },
      rls: { wide: [3, 0], narrow: [1, 2] },
      indexes: { wide: [4, 0], narrow: [0, 2] },
      audit: { wide: [3, 1], narrow: [0, 1] },
    },
    edges: [
      ['jwt', 'api'],
      ['api', 'evaluator'],
      ['evaluator', 'rls'],
      ['rls', 'indexes'],
      ['evaluator', 'audit'],
    ],
  },
  review: {
    // Narrow uses three columns here: docker fans out to three tools that fan back in to the tier, and
    // only a 3-wide grid keeps every connector between neighbouring cells (no line crosses a box).
    //
    // Review round 2: the stock grid left the one sideways connector almost no room. In the three-column narrow grid a part
    // takes 84 % of its column, so two parts side by side are 21 units apart: the PR diff to GitHub Actions connector was a
    // stub whose arrow head sat on the next box's border (about 26 px at 1440, 17 px on a phone), where every other
    // connector on the four drawings runs 32 units or more. Now the diff is in the first column and GitHub Actions in the
    // third, with the empty middle cell between them: 155 units (about 185 px at 1440) to travel, and GitHub Actions hands
    // down to the Docker stage in the centre with the same swoop the fan-out below it uses. Still five rows, so the sticky
    // drawing fits between the header and the status strip. Wide was six columns, so every connector had 25.7 units; the
    // tier and the inline comments now stack in the last column: five columns, the 30 units of gutter the other three
    // drawings have, and boxes wide enough for "GitHub Actions" on one line. schematics.test.ts keeps the rules: a connector
    // skips a cell only when that cell is empty, and nothing sideways in the narrow layout is a stub.
    placements: {
      diff: { wide: [0, 1], narrow: [0, 0] },
      actions: { wide: [1, 1], narrow: [2, 0] },
      docker: { wide: [2, 1], narrow: [1, 1] },
      eslint: { wide: [3, 0], narrow: [0, 2] },
      semgrep: { wide: [3, 1], narrow: [1, 2] },
      llm: { wide: [3, 2], narrow: [2, 2] },
      tier: { wide: [4, 1], narrow: [1, 3] },
      comments: { wide: [4, 2], narrow: [1, 4] },
    },
    edges: [
      ['diff', 'actions'],
      ['actions', 'docker'],
      ['docker', 'eslint'],
      ['docker', 'semgrep'],
      ['docker', 'llm'],
      ['eslint', 'tier'],
      ['semgrep', 'tier'],
      ['llm', 'tier'],
      ['tier', 'comments'],
    ],
  },
}

/** The schematic for a service: parts (with copy and positions), edges, title and description. */
export function getSchematic(service: ServiceKey): SchematicDefinition {
  const source = copy.services[service].schematic
  const layout = LAYOUT[service]
  return {
    service,
    title: source.title,
    desc: source.desc,
    nodes: source.nodes.map((node) => {
      const placement = layout.placements[node.id]
      if (!placement) throw new Error(`Schematic "${service}" has no placement for node "${node.id}"`)
      return { id: node.id, label: node.label, wide: placement.wide, narrow: placement.narrow }
    }),
    edges: layout.edges,
  }
}

const loaded = new Map<ServiceKey, Promise<Record<string, DepthText>>>()

/** Load (once) what a service's schematic parts say at each depth. Called by the Schematic dialog on the first click. */
export function loadNodeCopy(service: ServiceKey): Promise<Record<string, DepthText>> {
  let promise = loaded.get(service)
  if (!promise) {
    promise = import('./node-copy.ts').then((module) => module.NODE_COPY[service])
    loaded.set(service, promise)
  }
  return promise
}
