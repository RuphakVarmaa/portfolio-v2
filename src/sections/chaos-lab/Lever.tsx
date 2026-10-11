import { hexagon, rivet, roundedRect } from '../../lib/draw/paths.ts'
import { penLine } from '../../lib/draw/wobble.ts'
import styles from './ChaosLab.module.css'

/**
 * A knife switch, drawn by hand: base plate, four rivets, a hinge post on the left, a clip on the right
 * and a blade that really swings (a CSS transform on the blade on `--dur-1` / `--ease-relay`, so it is
 * instant under lite motion). It is a status light made of metal, not a decoration: the caller derives
 * `closed` from the real state of the thing it stands for (is policy-b up? are two tabs linked? does this
 * tab hold the leader lock?). Closed means current flows (cobalt); open shows a vermilion spark at the gap
 * while `spark` says something was just cut.
 */

export interface LeverProps {
  closed: boolean
  /** Show the spark at the open contacts: a worker that was cut and is not back yet. */
  spark?: boolean
  /** Unique per lever so no two hand-drawn plates wobble alike. */
  seed: string
}

const HINGE_X = 28
const HINGE_Y = 66
const RIVETS = [rivet(15, 17), rivet(117, 17), rivet(15, 79), rivet(117, 79)]

export function Lever({ closed, spark = false, seed }: LeverProps) {
  return (
    <svg className={styles.lever} viewBox="0 0 132 96" width="132" height="96" aria-hidden="true" data-closed={closed || undefined}>
      <path className={styles.leverPlate} d={roundedRect(5, 7, 122, 82, 9, `${seed}:plate`, 0.9)} />
      {RIVETS.map((d, i) => (
        <path key={i} className={styles.leverRivet} d={d} />
      ))}
      <path className={styles.leverWire} d="M0 66H19.5" />
      <path className={styles.leverWire} d="M110 66H132" />
      <path className={styles.leverClip} d={penLine([[96, 50], [96, 74], [110, 74], [110, 50]], `${seed}:clip`, { amp: 0.5, step: 14 })} />
      <path className={styles.leverPost} d={hexagon(HINGE_X, HINGE_Y, 8.5, `${seed}:post`, 0.5)} />
      <g className={styles.leverBlade}>
        <path
          className={styles.leverBladeShape}
          d={penLine([[HINGE_X, 62.5], [100, 62.5], [105.5, 66], [100, 69.5], [HINGE_X, 69.5]], `${seed}:blade`, { amp: 0.4, step: 16, closed: true })}
        />
        <path className={styles.leverHandle} d={penLine([[90, 62.5], [90, 47]], `${seed}:handle`, { amp: 0.4, step: 8 })} />
        <circle className={styles.leverKnob} cx="90" cy="43.5" r="4.6" />
      </g>
      <circle className={styles.leverPivot} cx={HINGE_X} cy={HINGE_Y} r="2.6" />
      {spark && !closed ? <path className={styles.leverSpark} d="M95 56l4-7 1.5 6 4.5-8" /> : null}
    </svg>
  )
}
