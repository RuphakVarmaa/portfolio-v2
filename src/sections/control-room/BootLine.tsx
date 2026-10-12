import { Fragment, useState } from 'react'
import { buildBootLine } from '../../cluster/boot-line.ts'
import { useQuorum, useTelemetry } from '../../cluster/store.ts'
import { copy } from '../../data/copy.ts'
import { NO_FIRST_READY, bootTimings, rememberFirstReady } from './boot-timings.ts'
import { bootTokens } from './boot-tokens.ts'
import styles from './ControlRoom.module.css'

/**
 * The boot line (spec 3.2): one mono line of the visitor's own boot, printed on a ruled paper tape.
 *
 *   booting ruphak.me v3 · node 1 of 1                                    (prerendered, before any JS)
 *   FCP 412 ms · retrieval up 530 ms · policy up 544 ms · review up 561 ms · vision standby · 1 node · term 1 ·
 *   no backend was harmed; this trace is yours.                           (measured, in this browser)
 *
 * Every millisecond comes from telemetry (PerformanceObserver paint timing, the scheduler's spawn and ready
 * marks); nothing here is a constant except the words. Until a measurement exists the prerendered text stays,
 * so the first client render equals the server render. The tape reserves its lines in CSS, so the text
 * arriving never moves anything (CLS 0). It is not a live region: the worker-ready events are announced once,
 * by the cluster, through the shared live region.
 *
 * With JavaScript off the cluster never starts, so "booting ruphak.me v3" would stay on the tape for good: the tape says so instead
 * (`data-nojs-only`, hidden by the pre-paint script's `data-js`), and the booting text is `data-js-only`. Same tape, same reserved
 * rows, so nothing moves.
 *
 * It is the log of the boot, so each service's "up" figure is frozen at its first `ready` (boot-timings.ts).
 * Telemetry's per-node timing is overwritten when a worker is respawned, and a line that read "policy up
 * 36380 ms" after the visitor pulled the plug would no longer be the boot log. The respawn itself is on the
 * chaos lab's tape and in the footer strip.
 *
 * The line is drawn as tokens (boot-tokens.ts), not as one string: each measurement is a nowrap unit with its
 * separator glued to its right, so a row can only end between two measurements. A plain string broke wherever a
 * space fell (the closing clause cut after "harmed;" at 1440 px, three phone rows starting with a lone dot).
 * The text a reader or a screen reader gets is the same line.
 */
export function BootLine() {
  const telemetry = useTelemetry()
  const quorum = useQuorum()
  // Remember each node's first `ready` for the life of the page. This is "storing information from previous
  // renders": the update happens while rendering (React re-renders at once, before anything is committed), so
  // the frozen figure is in place in the very commit that first shows it. It is a pure function of the
  // snapshot and of what was remembered, so a repeated or discarded render changes nothing.
  const [firstReady, setFirstReady] = useState(NO_FIRST_READY)
  const remembered = rememberFirstReady(firstReady, telemetry.workers)
  if (remembered !== firstReady) setFirstReady(remembered)

  const started = telemetry.fcp !== null || Object.keys(telemetry.workers).length > 0
  const text = started
    ? buildBootLine({
        fcp: telemetry.fcp,
        workers: bootTimings(remembered, telemetry.workers),
        nodes: quorum.nodes,
        term: quorum.term,
      })
    : copy.controlRoom.boot.prerendered
  return (
    <p className={styles.boot} data-measured={started || undefined}>
      <span data-js-only="">
        {bootTokens(text).map((token, index) => (
          <Fragment key={index}>
            {index > 0 ? ' ' : null}
            <span className={styles.tok} data-closing={token.length > 1 || undefined}>
              {token.length > 1
                ? token.map((piece, pieceIndex) => (
                    <Fragment key={pieceIndex}>
                      {pieceIndex > 0 ? ' ' : null}
                      <span>{piece}</span>
                    </Fragment>
                  ))
                : token[0]}
            </span>
          </Fragment>
        ))}
      </span>
      <span data-nojs-only="">{copy.controlRoom.boot.noScript}</span>
    </p>
  )
}
