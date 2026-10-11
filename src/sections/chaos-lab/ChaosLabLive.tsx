import { useLayoutEffect, useState } from 'react'
import { useQuorum } from '../../cluster/store.ts'
import { SoundToggle } from '../../components/shell/SoundToggle.tsx'
import shell from '../../components/shell/shell.module.css'
import { usePreferences } from '../../components/shell/preferences-context.ts'
import { ButtonLink } from '../../components/ui/Button.tsx'
import { cx } from '../../components/ui/cx.ts'
import { Stamp } from '../../components/ui/Stamp.tsx'
import { Tape, type TapeLine } from '../../components/ui/Tape.tsx'
import { copy } from '../../data/copy.ts'
import { LeaderBreaker, PlugBreaker, TabBreaker } from './Breaker.tsx'
import { useChaos } from './chaos.ts'
import { logStamp } from './format.ts'
import { LAB_KEY_ATTRIBUTE, takeHandoff, type LabKey } from './handoff.ts'
import { labels } from './labels.ts'
import { NodeLamps } from './NodeLamps.tsx'
import { Rivets } from './Rivets.tsx'
import { TermCounter } from './TermCounter.tsx'
import { useOperatorStamp } from './useOperatorStamp.ts'
import styles from './ChaosLab.module.css'

/**
 * The live Chaos Lab: a breaker panel. It is loaded lazily (DemoSlot) once the section is near the
 * viewport (or at the first Tab key press); the prerendered fallback in index.tsx has the same frame, titles
 * and captions, so nothing jumps when this replaces it. Nothing here starts anything on its own: the three
 * experiments run only when the visitor presses a button or closes a tab. The one thing done on arrival is
 * finishing what a visitor began on the fallback's stand-in buttons: if one held focus, its twin here takes
 * it; if one was pressed before this bench was ready, its twin is pressed now (handoff.ts).
 */
export default function ChaosLabLive() {
  // Layout effect: runs in the commit that replaces the fallback, before the browser paints, so focus
  // never shows as lost. The replayed press waits for the commit to finish.
  useLayoutEffect(() => {
    const active = document.activeElement
    const { focus, press } = takeHandoff({ now: performance.now(), focusLost: active === null || active === document.body })
    const find = (key: LabKey) => document.querySelector<HTMLElement>(`[${LAB_KEY_ATTRIBUTE}="${key}"]`)
    if (focus !== null) find(focus)?.focus()
    if (press !== null) queueMicrotask(() => find(press)?.click())
  }, [])

  const q = useQuorum()
  const chaos = useChaos()
  const operator = useOperatorStamp()
  const { sound } = usePreferences()
  // The stamp animates down only for the visitor who just earned it, not on every later visit.
  const [alreadyEarned] = useState(operator.earned)
  const done = [operator.steps.plug, operator.steps.tab, operator.steps.leader].filter(Boolean).length

  const lines: TapeLine[] = chaos.log.map((line) => ({ id: line.id, text: `${logStamp(line.at)}  ${line.text}`, tone: line.tone }))

  return (
    <div className={styles.bench}>
      <Rivets />
      <ol className={styles.breakers} aria-label={labels.experimentsLabel}>
        <PlugBreaker />
        <TabBreaker />
        <LeaderBreaker />
      </ol>

      <div className={styles.aside}>
        {/* The grid item stretches over the whole first row; the plate inside it is what sticks (see .asideStick). */}
        <div className={styles.asideStick}>
          <div className={styles.status}>
            <p className="stencil">{labels.cluster}</p>
            <TermCounter term={q.term} nodes={q.nodes} />
            <NodeLamps members={q.members} departed={chaos.departed} />
          </div>
          <div className={styles.operator} role="group" aria-label={labels.operator}>
            {operator.earned ? (
              <>
                <Stamp tone="live" size="lg" animate={!alreadyEarned}>
                  {copy.chaos.stamp}
                </Stamp>
                <p>{copy.chaos.complete}</p>
                <ButtonLink href={copy.colophon.links.experiments.href} variant="secondary">
                  {copy.colophon.links.experiments.label}
                </ButtonLink>
              </>
            ) : (
              <>
                <p className={styles.progress}>{labels.progress(done)}</p>
                <ul className={styles.steps}>
                  {(['plug', 'tab', 'leader'] as const).map((step) => (
                    <li key={step} data-done={operator.steps[step] || undefined}>
                      {labels.steps[step]}
                      <span className="sr-only">{operator.steps[step] ? ', done' : ', not yet'}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <SoundToggle className={cx(shell.toggle, styles.bigToggle)} />
            {sound ? <p className={styles.note}>{copy.chaos.soundCaption}</p> : null}
          </div>
        </div>
      </div>

      <div className={styles.logBox}>
        <Tape lines={lines} label={labels.logLabel} header={labels.logHeader} empty={labels.logEmpty} height="14rem" />
      </div>
    </div>
  )
}
