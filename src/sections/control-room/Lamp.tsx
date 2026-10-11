import type { CSSProperties } from 'react'
import { isLit } from '../../cluster/phase.ts'
import { SERVICE_LABEL } from '../../cluster/registry.ts'
import { useClusterState, useServicePhase } from '../../cluster/store.ts'
import { copy, projectFor } from '../../data/copy.ts'
import { goToId } from '../../lib/draw/motion.ts'
import { serviceAnchor } from '../../routes.ts'
import { LampArt } from './BoardSvg.tsx'
import { darkHalf, parsePipKey, pipKey, sentenceCase, type PipState } from './board-state.ts'
import { LAMP_POSITIONS, LAMP_POSITIONS_NARROW, LAMP_TILT, TOP_ROW, type LampId } from './lamp-positions.ts'
import styles from './ControlRoom.module.css'

type Vars = CSSProperties & Record<`--${string}`, string | number>

/** The lamp's place on the board, as the unitless percentages the CSS positions it with (wide and narrow layouts), and the angle it was mounted at. */
function placement(id: LampId): Vars {
  const wide = LAMP_POSITIONS[id]
  const narrow = LAMP_POSITIONS_NARROW[id]
  return { '--wx': wide.x, '--wy': wide.y, '--nx': narrow.x, '--ny': narrow.y, '--t': `${LAMP_TILT[id]}deg` }
}

interface LampViewProps {
  id: LampId
  /** The accessible name: "Retrieval — Agentic RAG Document Intelligence — ready". */
  label: string
  /** The project title on the nameplate (stencil, two lines allowed). Absent for SENSORS. */
  title?: string
  /** The short service name under it: RETRIEVAL. */
  name: string
  /** The status word: ready, standby, degraded ... */
  status: string
  lit: boolean
  pips?: readonly PipState[]
  onActivate: () => void
}

/**
 * A lamp: a real <button> laid over the drawing (spec 4.1), with its hand-drawn jewel (the sprite's lamp), a
 * nameplate (HTML text, so it stays crisp and readable at any board size) and one pip per worker node.
 * The nameplate sits above the lamp for the top row and below it for the others.
 *
 * Its state is two data attributes the stylesheet turns into custom properties: `data-lit` (the lens and the
 * glow rings) and `data-half` (one worker of a two-worker service is down: that half of the lens goes dark).
 */
function LampView({ id, label, title, name, status, lit, pips, onActivate }: LampViewProps) {
  const row = id === 'sensors' ? 'mid' : TOP_ROW.includes(id) ? 'top' : 'bottom'
  const half = lit && pips ? darkHalf(pips) : null
  return (
    <li className={styles.lampItem} style={placement(id)} data-row={row}>
      <button
        type="button"
        className={styles.lamp}
        data-lamp={id}
        data-lit={lit || undefined}
        data-half={half ?? undefined}
        aria-label={label}
        onClick={onActivate}
      >
        <LampArt />
        <span className={styles.plate}>
          {title ? <span>{title}</span> : null}
          <span>
            <span>{name}</span>
            {pips && pips.length > 0 ? (
              <span aria-hidden="true">
                {pips.map((state, index) => (
                  <i key={index} data-s={state} />
                ))}
              </span>
            ) : null}
            <span>{status}</span>
          </span>
        </span>
      </button>
    </li>
  )
}

/** One of the four service lamps. Lit the moment its worker pool is up; the status word and pips are the scheduler's own state. */
export function ServiceLamp({ id }: { id: Exclude<LampId, 'sensors'> }) {
  const t = copy.controlRoom.board
  const project = projectFor(id)
  const phase = useServicePhase(id)
  const pips = parsePipKey(useClusterState((state) => pipKey(state.nodes, id)))
  const status = t.status[phase]
  return (
    <LampView
      id={id}
      label={t.lampName(SERVICE_LABEL[id], project.title, status)}
      title={project.title}
      name={t.shortNames[id]}
      status={status}
      lit={isLit(phase)}
      pips={pips}
      onActivate={() => goToId(serviceAnchor(id))}
    />
  )
}

/**
 * The fifth lamp, only on devices that report motion sensors (decided after mount, never in the first
 * render). It is lit because the device has the sensors: it is a capability lamp, not a worker. Pressing
 * it goes to the Vision panel, where shaking the phone floods the same bounded queue the camera uses.
 */
export function SensorsLamp() {
  const t = copy.controlRoom.board
  const status = t.status.ready
  return (
    <LampView
      id="sensors"
      label={`${sentenceCase(t.sensorsLamp)} — ${t.sensorsCaption} — ${status}`}
      name={t.sensorsLamp}
      status={status}
      lit
      onActivate={() => goToId(serviceAnchor('vision'))}
    />
  )
}
