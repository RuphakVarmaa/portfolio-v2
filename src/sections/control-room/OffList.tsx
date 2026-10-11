import { useServicePhase } from '../../cluster/store.ts'
import { copy, projectFor } from '../../data/copy.ts'
import { serviceAnchor } from '../../routes.ts'
import { SERVICE_LAMPS } from './lamp-positions.ts'
import styles from './ControlRoom.module.css'

function Item({ id }: { id: (typeof SERVICE_LAMPS)[number] }) {
  const phase = useServicePhase(id)
  const t = copy.controlRoom.board
  return (
    <li>
      <span className="stencil">{t.shortNames[id]}</span>
      <a href={`#${serviceAnchor(id)}`}>{projectFor(id).title}</a>
      <span className="mono">{t.status[phase]}</span>
    </li>
  )
}

/**
 * "Skip the machine" (spec 4.0): the board collapses to a plain list of the four services with the same
 * status words the lamps use (`useServicePhase`, the one shared meaning of "ready"). It is in the prerendered
 * HTML and shown by CSS (`html[data-machine='off']`), so the page is right before any script runs.
 */
export function OffList() {
  const t = copy.controlRoom.machineOff
  return (
    <div className={`panel ${styles.off}`} data-machine-off-only="">
      <p>{t.heading}</p>
      <p className="muted measure">{t.note}</p>
      <ul>
        {SERVICE_LAMPS.map((id) => (
          <Item key={id} id={id} />
        ))}
      </ul>
    </div>
  )
}
