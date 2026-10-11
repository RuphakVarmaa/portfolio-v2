import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { copy } from '../../data/copy.ts'
import { loadNodeCopy, type Cell, type SchematicNode, type SchematicProps } from '../../data/schematics.ts'
import type { DepthText } from '../../data/copy.ts'
import { createRng, fmt, type Pt } from '../../lib/draw/wobble.ts'
import { usePreferences } from '../shell/preferences-context.ts'
import { Button } from './Button.tsx'
import { cx } from './cx.ts'
import { useSvgId } from './ids.ts'
import styles from './ui.module.css'

export type { SchematicProps, SchematicNode } from '../../data/schematics.ts'

/**
 * A hand-drawn, interactive schematic.
 *
 * The parts are real <button>s (one set, so the HTML stays small) positioned by CSS from two grid cells
 * each, one per layout; their hand-drawn outlines are CSS masks of wobbled paths (see ui.module.css).
 * The connectors are two small SVGs, one per layout, and a CSS container query shows the one that
 * matches the schematic's width (wide from 600 px). Everything is in the prerendered HTML, so nothing
 * needs JavaScript and nothing shifts after hydration. Activating a part opens a native <dialog> with
 * that part's copy at the current depth; focus returns to the part when it closes.
 */

type Kind = 'wide' | 'narrow'

interface LayoutSpec {
  width: number
  height: number
  pitchX: number
  pitchY: number
  nodeW: number
  nodeH: number
}

function layoutFor(kind: Kind, nodes: readonly SchematicNode[]): LayoutSpec {
  const cells = nodes.map((node) => node[kind])
  const cols = 1 + Math.max(...cells.map((cell) => cell[0]))
  const rows = 1 + Math.max(...cells.map((cell) => cell[1]))
  if (kind === 'wide') {
    const width = 760
    const pitchX = width / cols
    return { width, height: rows * 104, pitchX, pitchY: 104, nodeW: Math.max(100, Math.min(140, Math.round(pitchX * 0.8))), nodeH: 66 }
  }
  const width = 400
  const pitchX = width / cols
  return { width, height: rows * 98, pitchX, pitchY: 98, nodeW: Math.min(156, Math.round(pitchX * 0.84)), nodeH: 66 }
}

const centre = (cell: Cell, spec: LayoutSpec): Pt => [(cell[0] + 0.5) * spec.pitchX, (cell[1] + 0.5) * spec.pitchY]

/**
 * One connector as a single path: a gently bowed cubic from the edge of one part to the edge of the
 * next (control points nudged by the seeded PRNG so each line is a little different), then a crisp
 * chevron arrow head. The wide layout reads left to right, so any connector that changes column runs
 * side to side (fan-outs leave one point, fan-ins arrive at one point); the narrow layout reads top to
 * bottom, so only connectors within a row run sideways.
 */
function connector(from: Cell, to: Cell, spec: LayoutSpec, kind: Kind, seed: string): string {
  const [ax, ay] = centre(from, spec)
  const [bx, by] = centre(to, spec)
  const dc = to[0] - from[0]
  const dr = to[1] - from[1]
  const rng = createRng(seed)
  const nudge = () => (rng() - 0.5) * 3
  const horizontal = kind === 'wide' ? dc !== 0 : dr === 0
  const sign = (horizontal ? dc : dr) > 0 ? 1 : -1
  const start: Pt = horizontal ? [ax + sign * (spec.nodeW / 2), ay] : [ax, ay + sign * (spec.nodeH / 2)]
  const end: Pt = horizontal ? [bx - sign * (spec.nodeW / 2), by] : [bx, by - sign * (spec.nodeH / 2)]
  const c1: Pt = horizontal ? [(start[0] * 2 + end[0]) / 3, start[1] + nudge()] : [start[0] + nudge(), (start[1] * 2 + end[1]) / 3]
  const c2: Pt = horizontal ? [(start[0] + end[0] * 2) / 3, end[1] + nudge()] : [end[0] + nudge(), (start[1] + end[1] * 2) / 3]
  const curve = `M${fmt(start[0])} ${fmt(start[1])}C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(end[0])} ${fmt(end[1])}`
  const [dx, dy] = horizontal ? [sign, 0] : [0, sign]
  const back: Pt = [end[0] - dx * 8, end[1] - dy * 8]
  const head = `M${fmt(back[0] - dy * 5)} ${fmt(back[1] + dx * 5)}L${fmt(end[0])} ${fmt(end[1])}L${fmt(back[0] + dy * 5)} ${fmt(back[1] - dx * 5)}`
  return curve + head
}

/** `chunk (512-token windows)` -> main `chunk`, sub `512-token windows`. */
function splitLabel(label: string): { main: string; sub: string | null } {
  const open = label.indexOf(' (')
  if (open < 0 || !label.endsWith(')')) return { main: label, sub: null }
  return { main: label.slice(0, open), sub: label.slice(open + 2, -1) }
}

type Vars = CSSProperties & Record<`--${string}`, string | number>

export function Schematic(props: SchematicProps) {
  const { service, title, desc, nodes, edges, active = [], annotations, onNode, depth: depthProp, className } = props
  const preferences = usePreferences()
  const depth = depthProp ?? preferences.depth
  const prefix = useSvgId('sch')
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [loadedCopy, setLoadedCopy] = useState<Record<string, DepthText> | null>(null)
  const openNode = nodes.find((node) => node.id === openId) ?? null

  const specs: Record<Kind, LayoutSpec> = { wide: layoutFor('wide', nodes), narrow: layoutFor('narrow', nodes) }
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const lit = new Set(active)

  const canvasVars: Vars = {
    '--wW': specs.wide.width,
    '--wH': specs.wide.height,
    '--wPx': specs.wide.pitchX,
    '--wPy': specs.wide.pitchY,
    '--wNw': specs.wide.nodeW,
    '--wNh': specs.wide.nodeH,
    '--nW': specs.narrow.width,
    '--nH': specs.narrow.height,
    '--nPx': specs.narrow.pitchX,
    '--nPy': specs.narrow.pitchY,
    '--nNw': specs.narrow.nodeW,
    '--nNh': specs.narrow.nodeH,
  }

  const connectors = (kind: Kind) =>
    edges.map(([a, b]) => {
      const from = byId.get(a)
      const to = byId.get(b)
      if (!from || !to) return null
      return <path key={`${a}>${b}`} className={lit.has(a) && lit.has(b) ? styles.edgeLive : styles.edge} d={connector(from[kind], to[kind], specs[kind], kind, `${a}>${b}`)} />
    })

  const openPart = (id: string, button: HTMLButtonElement) => {
    trigger.current = button
    setOpenId(id)
    onNode?.(id)
  }

  // The dialog's content renders from `openId`; show the modal once it has.
  useEffect(() => {
    if (openId && dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [openId])

  // What a part says is ~16 KB of prose nobody needs until a click: fetch it then (cached afterwards).
  useEffect(() => {
    if (!openId || !service) return
    let current = true
    loadNodeCopy(service).then(
      (copyById) => {
        if (current) setLoadedCopy(copyById)
      },
      () => undefined,
    )
    return () => {
      current = false
    }
  }, [openId, service])

  const prefetch = () => {
    if (service) void loadNodeCopy(service)
  }
  const openText = openNode ? (openNode.copy ?? loadedCopy?.[openNode.id])?.[depth] : undefined

  const close = () => dialog.current?.close()

  return (
    <>
      <figure className={cx(styles.schematic, className)} role="group" aria-labelledby={`${prefix}t`} aria-describedby={`${prefix}d`} data-schematic="">
        <div className={styles.schematicCanvas} style={canvasVars}>
          <svg className={styles.schematicNarrow} viewBox={`0 0 ${specs.narrow.width} ${specs.narrow.height}`} aria-hidden="true">
            {connectors('narrow')}
          </svg>
          <svg className={styles.schematicWide} viewBox={`0 0 ${specs.wide.width} ${specs.wide.height}`} aria-hidden="true">
            <title id={`${prefix}t`}>{title}</title>
            <desc id={`${prefix}d`}>{desc}</desc>
            {connectors('wide')}
          </svg>
          {nodes.map((node) => {
            const { main, sub } = splitLabel(node.label)
            const note = annotations?.[node.id]
            const position: Vars = { '--wx': node.wide[0], '--wy': node.wide[1], '--nx': node.narrow[0], '--ny': node.narrow[1] }
            return (
              <button
                key={node.id}
                type="button"
                className={cx(styles.node, lit.has(node.id) && styles.nodeActive)}
                style={position}
                aria-haspopup="dialog"
                onPointerEnter={prefetch}
                onFocus={prefetch}
                onClick={(event) => openPart(node.id, event.currentTarget)}
              >
                <span className={styles.nodeMain}>{main}</span>
                {sub ? <span className={styles.nodeSub}>{`(${sub})`}</span> : null}
                {note ? <span className={styles.nodeNote}>{note}</span> : null}
              </button>
            )
          })}
        </div>
        <figcaption className={styles.schematicHint}>{copy.services.panel.schematicHint}</figcaption>
      </figure>
      <dialog
        ref={dialog}
        className={styles.nodeDialog}
        aria-labelledby={`${prefix}-dialog-title`}
        onClose={() => {
          trigger.current?.focus()
          setOpenId(null)
        }}
        onClick={(event) => {
          if (event.target === dialog.current) close()
        }}
      >
        {openNode ? (
          <div className={styles.nodeDialogBody}>
            <p className="stencil">{title}</p>
            <h3 id={`${prefix}-dialog-title`} className={styles.nodeDialogTitle}>
              {openNode.label}
            </h3>
            <p className={styles.nodeDialogCopy}>{openText ?? copy.services.panel.demoLoading}</p>
            <p className="mono muted">
              {copy.services.panel.depthLegend}: {copy.services.panel.depthOptions[depth]}
            </p>
            <div className={styles.nodeDialogActions}>
              <Button variant="primary" onClick={close}>
                {copy.services.panel.nodeDialogClose}
              </Button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  )
}
