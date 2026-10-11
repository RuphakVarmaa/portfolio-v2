import { useEffect, useRef, useState, type ComponentType } from 'react'
import { useClusterState } from '../../cluster/store.ts'
import { PlainCaption } from '../../components/ui/PlainCaption.tsx'
import { copy } from '../../data/copy.ts'
import { hotKey, parseHotKey } from './board-state.ts'
import type { CablesProps } from './Cables.tsx'
import { SensorsLamp, ServiceLamp } from './Lamp.tsx'
import { SERVICE_LAMPS } from './lamp-positions.ts'
import { Relay } from './Relay.tsx'
import { useBoardMotion, useHasMotionSensors } from './useBoardMotion.ts'
import styles from './ControlRoom.module.css'

const DESCRIPTION_ID = 'board-description'
const BOARD_LABEL = 'Cluster board'

/**
 * The board (spec 3.2, 4.1): a relay in the middle, a jewel lamp for each service, patch cables between
 * them. The drawing is SVG with `aria-hidden`; the lamps are real <button>s laid over it, and an sr-only
 * paragraph describes the whole. `data-board` is what telemetry's frame sampler watches: it runs only while
 * this element is at least 10 % on screen.
 *
 * Everything on it is the scheduler's own state: a lamp is lit when its worker pool is up, a cable is
 * vermilion while a job of that service runs, the relay arm throws on each message. See useBoardMotion.
 *
 * The cables are the one part that is not in the prerendered HTML: they are a lazy chunk (the cable
 * geometry is not needed until the board is seen), mounted the first time the board is on screen, and they
 * draw themselves then. Without JavaScript the whole board is hidden (`data-js-only`): its lamps are
 * buttons that do nothing until the page script runs, and the service index above it has the same links.
 */
export function Board() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [Cables, setCables] = useState<ComponentType<CablesProps> | null>(null)
  const sensors = useHasMotionSensors()
  const { drawn } = useBoardMotion(rootRef)
  const hot = parseHotKey(useClusterState((state) => hotKey(state.queue)))
  const t = copy.controlRoom.board

  useEffect(() => {
    let live = true
    void import('./Cables.tsx').then((module) => {
      if (live) setCables(() => module.Cables)
    })
    return () => {
      live = false
    }
  }, [])

  return (
    <figure className={styles.boardFigure} data-machine-only="" data-js-only="" data-no-print="">
      <div ref={rootRef} className={styles.board} data-board="" role="group" aria-label={BOARD_LABEL} aria-describedby={DESCRIPTION_ID}>
        <p id={DESCRIPTION_ID} className="sr-only">
          {t.srDescription}
        </p>
        <i />
        <i />
        <i />
        <i />
        {drawn && Cables ? <Cables hot={hot} sensors={sensors} /> : null}
        <Relay />
        <ul className={styles.lamps} role="list">
          {SERVICE_LAMPS.map((id) => (
            <ServiceLamp key={id} id={id} />
          ))}
          {sensors ? <SensorsLamp /> : null}
        </ul>
      </div>
      <figcaption className={styles.boardCaption}>
        <PlainCaption>{t.plain}</PlainCaption>
        {sensors ? (
          <p className={styles.sensorsCaption}>
            <span className={styles.sensorsLabel}>{t.sensorsLamp}</span> {t.sensorsCaption}
          </p>
        ) : null}
      </figcaption>
    </figure>
  )
}
