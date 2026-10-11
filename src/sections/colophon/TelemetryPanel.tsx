import { formatBytes, formatMs } from '../../cluster/format.ts'
import { useTelemetry, useTierInfo } from '../../cluster/store.ts'
import { DROPPED_FRAME_MS } from '../../cluster/telemetry.ts'
import { Readout } from '../../components/ui/Readout.tsx'
import { Stamp } from '../../components/ui/Stamp.tsx'
import { copy } from '../../data/copy.ts'
import styles from './Colophon.module.css'

/** Short UI wording for the panel's states and sources (the headings are in `copy.colophon`). */
const L = {
  workersNone: 'No worker has started in this tab yet.',
  workersShort: 'none started',
  framesShort: 'not sampled yet',
  modelsShort: 'none loaded',
  workersHead: ['Node', 'Spawned at', 'Ready at', 'Spin-up'],
  ready: (ready: number, started: number) => `${ready} of ${started} ready`,
  framesNone: 'Not sampled yet: the board has not been on screen.',
  framesBody: (frames: number, sampling: boolean) =>
    `Mean time between frames from requestAnimationFrame, measured only while the board is on screen. ${frames} frames sampled${sampling ? '; sampling now' : ''}.`,
  droppedBody: `A frame counts as dropped when it took longer than ${DROPPED_FRAME_MS} ms.`,
  modelsNone: 'No model has been loaded in this tab.',
  modelsLoaded: (count: number) => `${count} loaded`,
  of: 'of',
  reasons: (count: number) => (count === 0 ? 'none' : `${count} ${count === 1 ? 'reason' : 'reasons'}`),
  sources: 'Read in this tab with PerformanceObserver, User Timing marks and requestAnimationFrame. Nothing is sent anywhere.',
}

const dash = '—'

/** A measured number (or an em dash until it has been measured) for a Doto readout. */
const measured = (value: number | null): number | string => (value === null ? dash : value)

/**
 * Live telemetry (spec 3.8): the visitor's own session, as the browser measured it. TTFB, FCP and LCP in Doto
 * readouts beside the device tier (a stamp); worker ready times, the frame budget, dropped frames, model
 * bytes and the reasons for the tier in native <details> rows (each summary shows the live headline, the
 * body the detail). Every figure comes from `useTelemetry()` or `useTierInfo()`; an unmeasured one is an em
 * dash, never a placeholder number. Loaded as a lazy chunk by the Colophon.
 */
export default function TelemetryPanel() {
  const t = copy.colophon.telemetry
  const b = copy.colophon.buildTrace
  const s = useTelemetry()
  const tier = useTierInfo()

  const workers = Object.entries(s.workers)
    .filter(([, timing]) => timing.spawnAt !== null)
    .sort(([a], [z]) => a.localeCompare(z))
  const ready = workers.filter(([, timing]) => timing.readyAt !== null).length
  const models = Object.entries(s.models)
  const { frames } = s
  // Why this tier: every rule that fired; when none did, say so and list what was measured instead.
  const why = tier.reasons.length > 0 ? tier.reasons : [b.noReasons, ...tier.facts]

  return (
    <div className={`panel ${styles.telemetry}`}>
      <ul className={styles.paint}>
        {(
          [
            [t.ttfb, s.ttfb],
            [t.fcp, s.fcp],
            [t.lcp, s.lcp],
          ] as const
        ).map(([label, value]) => (
          <li key={label}>
            <span className="stencil">{label}</span>
            <span className={styles.reading}>
              <Readout value={measured(value)} width={4} size="md" />
              <span className={styles.unit}>MS</span>
            </span>
          </li>
        ))}
        <li>
          <span className="stencil">{b.tier}</span>
          <span className={styles.reading}>
            <Stamp size="md" rotate={-3}>
              {copy.header.tier.names[tier.tier]}
            </Stamp>
          </span>
        </li>
      </ul>

      <div className={styles.rows}>
        <details>
          <summary>
            <span>{t.workers}</span>
            <span>{workers.length === 0 ? L.workersShort : L.ready(ready, workers.length)}</span>
          </summary>
          {workers.length === 0 ? (
            <p>{L.workersNone}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  {L.workersHead.map((heading) => (
                    <th key={heading} scope="col">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workers.map(([node, timing]) => (
                  <tr key={node}>
                    <th scope="row">{node}</th>
                    <td>{timing.spawnAt === null ? dash : formatMs(timing.spawnAt)}</td>
                    <td>{timing.readyAt === null ? dash : formatMs(timing.readyAt)}</td>
                    <td>{timing.spinUpMs === null ? dash : formatMs(timing.spinUpMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </details>

        <details>
          <summary>
            <span>{t.frames}</span>
            <span>{frames.frames === 0 ? L.framesShort : `${frames.avgMs} ms · ${frames.fps} fps`}</span>
          </summary>
          <p>{frames.frames === 0 ? L.framesNone : L.framesBody(frames.frames, frames.sampling)}</p>
        </details>

        <details>
          <summary>
            <span>{t.dropped}</span>
            <span>{frames.frames === 0 ? L.framesShort : `${frames.dropped} ${L.of} ${frames.frames}`}</span>
          </summary>
          <p>{L.droppedBody}</p>
        </details>

        <details>
          <summary>
            <span>{t.models}</span>
            <span>{models.length === 0 ? L.modelsShort : L.modelsLoaded(models.length)}</span>
          </summary>
          {models.length === 0 ? (
            <p>{L.modelsNone}</p>
          ) : (
            <ul>
              {models.map(([service, model]) => (
                <li key={service}>
                  {service}: {formatBytes(model.loaded)}
                  {model.total === null ? '' : ` ${L.of} ${formatBytes(model.total)}`}
                </li>
              ))}
            </ul>
          )}
        </details>

        <details>
          <summary>
            <span>{b.tierReasons}</span>
            <span>{L.reasons(tier.reasons.length)}</span>
          </summary>
          <ul>
            {why.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      </div>

      <p className={styles.sources}>{L.sources}</p>
    </div>
  )
}
