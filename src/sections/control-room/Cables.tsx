import type { CSSProperties } from 'react'
import { serviceNumber } from '../../data/copy.ts'
import { layoutGeometry } from './board-cables.ts'
import { LAMP_ORDER, type LampId, type LayoutKind } from './lamp-positions.ts'
import styles from './ControlRoom.module.css'

/**
 * The patch cables (spec 2.5, 4.1): cobalt, with a plug at each end. Client only, and loaded lazily (see
 * Board.tsx): the cables are not facts, and they draw themselves the first time the board is on screen, so
 * drawing them earlier would waste the one animation the board has. Both layouts are drawn; a container
 * query shows one.
 *
 * Each cable is three strokes on the same path (`pathLength="1"`, so dash maths needs no measuring):
 *   - the cable (cobalt; vermilion while a job of that service runs on a worker)
 *   - a thin lighter sheen, offset by a pixel, so it reads as a round cable
 *   - the pulse: a short paper-coloured dash that useBoardMotion runs along the cable on every message (it shows
 *     on the cobalt cable and on the vermilion one a running job turns it into)
 * The path runs from the relay to the lamp, so a pulse "out" is the scheduler sending and "in" a worker answering.
 *
 * The self-draw is a CSS animation on `stroke-dashoffset` (`--dur-boot`, `--ease-out`, 90 ms per cable): it
 * needs no GSAP, and it is instant under lite motion because the duration token is 0.
 */

const GEOMETRY: Readonly<Record<LayoutKind, ReturnType<typeof layoutGeometry>>> = {
  wide: layoutGeometry('wide'),
  narrow: layoutGeometry('narrow'),
}

export interface CablesProps {
  /** The lamps whose cable is hot (a job of that service is running on a worker). */
  hot: ReadonlySet<LampId>
  /** Whether the SENSORS lamp (and so its cable) exists on this device. */
  sensors: boolean
}

export function Cables({ hot, sensors }: CablesProps) {
  return (
    <>
      {(['wide', 'narrow'] as const).map((kind) => {
        const geometry = GEOMETRY[kind]
        return (
          <svg
            key={kind}
            className={`${styles.cables} ${kind === 'wide' ? styles.cablesWide : styles.cablesNarrow}`}
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            aria-hidden="true"
          >
            {geometry.cables
              .filter((cable) => cable.id !== 'sensors' || sensors)
              .map((cable) => (
                <g
                  key={cable.id}
                  className={styles.cable}
                  data-cable={cable.id}
                  style={{ '--i': LAMP_ORDER.indexOf(cable.id) } as CSSProperties}
                  data-hot={hot.has(cable.id) || undefined}
                >
                  <path className={styles.cableLine} d={cable.d} pathLength={1} />
                  <path className={styles.cableSheen} d={cable.d} pathLength={1} />
                  <path className={styles.pulse} d={cable.d} pathLength={1} data-pulse={cable.id} />
                  <g className={styles.plugRelay}>
                    <path className={styles.plugMetal} d={cable.plugs[0].metal} />
                    <path className={styles.plugBoot} d={cable.plugs[0].boot} />
                  </g>
                  <g className={styles.plugLamp}>
                    <path className={styles.plugMetal} d={cable.plugs[1].metal} />
                    <path className={styles.plugBoot} d={cable.plugs[1].boot} />
                  </g>
                  {cable.id === 'sensors' ? null : (
                    <g className={styles.tag} transform={`translate(${cable.mid[0].toFixed(1)} ${cable.mid[1].toFixed(1)})`}>
                      <use className={styles.tagHex} href="#qb-hx" transform="translate(-18 -18) scale(.75)" />
                      <text>{String(serviceNumber(cable.id)).padStart(2, '0')}</text>
                    </g>
                  )}
                </g>
              ))}
          </svg>
        )
      })}
    </>
  )
}
