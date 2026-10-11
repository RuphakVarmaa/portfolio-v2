import type { CSSProperties } from 'react'
import { STEP_ORDER, type StepId } from '../../../lib/policy/engine.ts'
import { circle, roundedRect } from '../../../lib/draw/paths.ts'
import { penLine, type Pt } from '../../../lib/draw/wobble.ts'
import styles from './Policy.module.css'
import { POLICY_STRINGS as t } from './strings.ts'

/**
 * The rulebook's decision as a relay ladder: one rung, three contacts in series (tenant, rule, role) and an
 * output coil. Current flows left to right through every contact that closes; the first contact that
 * stays open stops it, and that contact is where the request was refused. Drawn from the engine's own
 * answer (`stop` is the check that refused it, or null), not recomputed here.
 *
 * Cobalt is current (a connection), vermilion is the open contact (a refusal), dashed grey is a part
 * the current never reached. Every state is also written under the drawing, so nothing rests on colour.
 *
 * Motion is causal: a new verdict re-mounts the ladder (the Playground keys it) and the contacts throw shut
 * one after another, 1 step apart, with the relay ease; the current appears in each wire as its contact
 * closes. The step is the `--dur-1` token, 0 ms under lite motion, so there the final state shows at once.
 * Each animated part carries its position in the sequence as `--n`.
 */

const Y = 32
/** Centres of the three contacts, then the coil: the centres of four equal columns of a 400-wide box. */
const CENTRES = [50, 150, 250] as const
const COIL_X = 350
/** A contact sits on a plate this wide and tall, with a terminal near each end. */
const PLATE_W = 52
const PLATE_H = 30
const TERMINAL = 15
/** The step of the sequence at which the coil, and the wires around it, take current. */
const COIL_STEP = CENTRES.length

type RungState = 'passed' | 'stopped' | 'skipped'

const stateOf = (index: number, stop: StepId | null): RungState => {
  if (stop === null) return 'passed'
  const stopIndex = STEP_ORDER.indexOf(stop)
  return index < stopIndex ? 'passed' : index === stopIndex ? 'stopped' : 'skipped'
}

const wire = (from: number, to: number, seed: string): string => penLine([[from, Y], [to, Y]] as Pt[], seed, { amp: 0.6, step: 40 })

const RAIL_LEFT = 'M6 10L6 54'
const RAIL_RIGHT = 'M394 10L394 54'

type Vars = CSSProperties & Record<`--${string}`, string | number>
const step = (n: number): Vars => ({ '--n': n })

export interface LadderProps {
  /** The check that refused the request, or null when every check passed. */
  stop: StepId | null
  allow: boolean
}

interface Segment {
  d: string
  /** Carries current in this verdict. */
  on: boolean
  /** Its place in the sequence. */
  n: number
}

export function Ladder({ stop, allow }: LadderProps) {
  const states = STEP_ORDER.map((_, index) => stateOf(index, stop))
  // The wire into contact i carries current if every contact before it closed.
  const flowsInto = (index: number) => states.slice(0, index).every((state) => state === 'passed')

  const segments: Segment[] = []
  const plates: Array<{ d: string; className: string }> = []
  const blades: Array<{ d: string; className: string; style: Vars }> = []
  let previousRight = 6
  CENTRES.forEach((centre, index) => {
    const left = centre - PLATE_W / 2
    segments.push({ d: wire(previousRight, left, `ladder:in:${index}`), on: flowsInto(index), n: index })
    const state = states[index]
    plates.push({
      d: roundedRect(left, Y - PLATE_H / 2, PLATE_W, PLATE_H, 3, `ladder:plate:${index}`, 0.7),
      className: state === 'passed' ? styles.plate : state === 'stopped' ? styles.plateStopped : styles.plateIdle,
    })
    // One closed blade, from terminal to terminal; an open contact is the same blade swung up about its left terminal.
    blades.push({
      d: penLine([[centre - TERMINAL, Y], [centre + TERMINAL, Y]], `ladder:blade:${index}`, { amp: 0.4, step: 40 }),
      className: state === 'passed' ? styles.bladeClosed : state === 'stopped' ? styles.bladeOpen : styles.bladeIdle,
      style: { ...step(index), transformOrigin: `${centre - TERMINAL}px ${Y}px` },
    })
    previousRight = centre + PLATE_W / 2
  })
  segments.push({ d: wire(previousRight, COIL_X - 14, 'ladder:coil-in'), on: allow, n: COIL_STEP })
  segments.push({ d: wire(COIL_X + 14, 394, 'ladder:coil-out'), on: allow, n: COIL_STEP })
  const coil = circle(COIL_X, Y, 14)

  return (
    <div className={styles.ladder} role="group" aria-label={t.ladderLabel}>
      <svg className={styles.ladderSvg} viewBox="0 0 400 64" aria-hidden="true">
        <path className={styles.rail} d={RAIL_LEFT} />
        <path className={styles.rail} d={RAIL_RIGHT} />
        {segments.map((segment, index) => (
          <path key={`base${index}`} className={styles.wireOff} d={segment.d} />
        ))}
        {plates.map((plate, index) => (
          <path key={index} className={plate.className} d={plate.d} />
        ))}
        {segments.map((segment, index) =>
          segment.on ? <path key={`on${index}`} className={styles.wireOn} d={segment.d} style={step(segment.n)} /> : null,
        )}
        {blades.map((blade, index) => (
          <path key={index} className={blade.className} d={blade.d} style={blade.style} />
        ))}
        {CENTRES.map((centre) => (
          <g key={centre}>
            <path className={styles.terminal} d={circle(centre - TERMINAL, Y, 3.4)} />
            <path className={styles.terminal} d={circle(centre + TERMINAL, Y, 3.4)} />
          </g>
        ))}
        <path className={styles.coilOff} d={coil} />
        {allow ? <path className={styles.coilOn} d={coil} style={step(COIL_STEP)} /> : null}
      </svg>
      <ol className={styles.rungs}>
        {STEP_ORDER.map((id, index) => (
          <li key={id} className={styles.rung} data-state={states[index]}>
            <span className="stencil">{t.ladder[id]}</span>
            <span className={styles.rungState}>{t.ladderState[states[index]]}</span>
          </li>
        ))}
        <li className={styles.rung} data-state={allow ? 'allowed' : 'denied'}>
          <span className="stencil">{t.ladder.out}</span>
          <span className={styles.rungState}>{allow ? t.ladderState.allowed : t.ladderState.denied}</span>
        </li>
      </ol>
    </div>
  )
}
