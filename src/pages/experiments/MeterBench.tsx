import { useState } from 'react'
import { Button } from '../../components/ui/Button.tsx'
import { Meter } from '../../components/ui/Meter.tsx'
import { copy, projectFor } from '../../data/copy.ts'
import styles from '../Experiments.module.css'
import { tools } from './tools-copy.ts'

interface Dial {
  key: 'inference' | 'queue' | 'dropped'
  label: string
  min: number
  max: number
  step: number
  warn?: number
  decimals: number
}

/** The limit the production system alerts on, read from the data file (`<30ms` -> 30), never retyped. */
function inferenceLimit(): number | undefined {
  const value = projectFor('vision').metrics.find((metric) => metric.label === 'inference')?.value
  const parsed = /\d+(?:\.\d+)?/.exec(value ?? '')
  return parsed ? Number(parsed[0]) : undefined
}

const gauges = copy.services.vision.demo.gauges
const DIALS: readonly Dial[] = [
  { key: 'inference', label: gauges.inference, min: 0, max: 60, step: 1, warn: inferenceLimit(), decimals: 0 },
  { key: 'queue', label: gauges.queue, min: 0, max: 4, step: 1, warn: 3, decimals: 0 },
  { key: 'dropped', label: gauges.dropped, min: 0, max: 50, step: 1, decimals: 0 },
]

/**
 * The analog meter used on this site (the Vision gauges), on a bench: drive it with your own values and
 * watch the needle throw with its overshoot (instant under lite motion). The three dials are the same part
 * with the same labels as the Vision panel. Every value here is one the visitor typed or dragged; none is
 * a measurement, and the heading says so.
 */
export default function MeterBench() {
  const t = tools.meter
  const [values, setValues] = useState<Record<Dial['key'], number>>({ inference: 0, queue: 0, dropped: 0 })
  const [instant, setInstant] = useState(false)
  const set = (key: Dial['key'], value: number) => setValues((previous) => ({ ...previous, [key]: value }))

  return (
    <div className={styles.stack}>
      <p className="stencil">{t.heading}</p>
      <div className={styles.dials}>
        {DIALS.map((dial) => (
          <div key={dial.key} className={styles.dial}>
            <Meter label={dial.label} value={values[dial.key]} min={dial.min} max={dial.max} warn={dial.warn} decimals={dial.decimals} instant={instant} />
            <label className={styles.field}>
              <span className="stencil">
                {t.value}: {dial.label}
              </span>
              <input
                type="range"
                min={dial.min}
                max={dial.max}
                step={dial.step}
                value={values[dial.key]}
                onChange={(event) => set(dial.key, Number(event.target.value))}
                aria-valuetext={`${values[dial.key]}`}
              />
            </label>
            <div className={styles.presets}>
              <Button size="sm" variant="secondary" onClick={() => set(dial.key, dial.min)}>
                {t.presets.zero}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => set(dial.key, (dial.min + dial.max) / 2)}>
                {t.presets.mid}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => set(dial.key, dial.max)}>
                {t.presets.full}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={instant} onChange={(event) => setInstant(event.target.checked)} />
        <span>{t.instant}</span>
      </label>
    </div>
  )
}
