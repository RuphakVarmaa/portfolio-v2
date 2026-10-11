import { useId } from 'react'
import { Button } from '../../../components/ui/Button.tsx'
import { PlainCaption } from '../../../components/ui/PlainCaption.tsx'
import { copy } from '../../../data/copy.ts'
import { Label } from './Label.tsx'
import { CONSUMER_DELAYS, QUEUE_CAPACITY, type ConsumerSpeed, type Pipeline } from './Pipeline.ts'
import { Rack } from './Rack.tsx'
import { strings } from './strings.ts'
import { useEngine } from './useEngine.ts'
import styles from './Vision.module.css'

const SPEEDS: readonly ConsumerSpeed[] = ['normal', 'slow', 'stalled']

/** "Slow the worker on purpose": three positions, a radio group, with the exact delay it adds said out loud. */
function SpeedControl({ engine }: { engine: Pipeline }) {
  const name = useId()
  const speed = useEngine(engine, (s) => s.speed)
  return (
    <fieldset className={styles.speed}>
      <legend className={styles.label}>{strings.speed.legend}</legend>
      <div className={styles.speedOptions}>
        {SPEEDS.map((key) => (
          <label key={key} className={styles.speedOption}>
            <input type="radio" className="sr-only" name={name} value={key} checked={speed === key} onChange={() => engine.setSpeed(key)} />
            <span className={styles.speedFace} data-on={speed === key || undefined}>
              {strings.speed[key]}
            </span>
          </label>
        ))}
      </div>
      <p className={styles.speedNote}>{speed === 'normal' ? strings.speed.help : strings.speed.note(CONSUMER_DELAYS[speed])}</p>
    </fieldset>
  )
}

/**
 * The motion sensors as a second producer for the same queue (a phone only). Pressing it is the tap iOS
 * needs for its permission prompt; shaking the phone then pushes samples into the rack as fast as the
 * sensor reports them.
 */
function MotionControl({ engine }: { engine: Pipeline }) {
  const t = copy.services.vision.demo
  const s = useEngine(engine, (x) => ({
    motion: x.motion,
    // Without a detector (or a slowed worker) the worker easily outruns a phone's motion sensor: say so.
    keepingUp: x.speed === 'normal' && x.detector.status !== 'ready',
  }))
  const on = s.motion === 'waiting' || s.motion === 'live' || s.motion === 'asking'
  return (
    <div className={styles.motion}>
      <Button variant="secondary" pressed={on} onClick={on ? () => engine.stopMotion() : () => void engine.startMotion()}>
        {strings.controls.motion}
      </Button>
      <p className={styles.note}>
        {t.phoneExtra} {s.motion === 'off' ? '' : strings.motion[s.motion]}
        {s.motion === 'live' && s.keepingUp ? ` ${strings.motion.keepingUp}` : ''}
      </p>
    </div>
  )
}

/**
 * The queue between capture and inference, as an instrument you can play (spec 4.4): the rack that draws
 * what the ring really holds, the motion sensors as a second producer, and a switch that slows the worker
 * so a healthy pipeline can be pushed into backpressure on purpose and watched. Present only where the
 * pipeline can run at all.
 */
export function Queue({ engine, motionCapable }: { engine: Pipeline; motionCapable: boolean }) {
  const titleId = useId()
  const canRun = useEngine(engine, (s) => s.capability === 'ok')
  if (!canRun) return null
  return (
    <section className={styles.queue} aria-labelledby={titleId}>
      <div className={styles.queueHead}>
        <Label id={titleId}>{strings.queue.heading}</Label>
        <span className={styles.hint}>{strings.queue.hint(QUEUE_CAPACITY)}</span>
      </div>
      <Rack engine={engine} />
      <PlainCaption>{strings.queue.plain(QUEUE_CAPACITY)}</PlainCaption>
      <div className={styles.queueControls}>
        {motionCapable ? <MotionControl engine={engine} /> : null}
        <SpeedControl engine={engine} />
      </div>
    </section>
  )
}
